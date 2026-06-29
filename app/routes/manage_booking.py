from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime, timezone
from uuid import UUID

from app.limiter import limiter
from app.services.supabase import get_supabase_client
from app.services.booking_engine import create_rescheduled_booking, SlotNoLongerAvailableError
from app.services.calendar_sync import sync_booking_to_calendar, cancel_calendar_event
from app.services.notifications import queue_cancellation_notifications, queue_reschedule_notifications
from app.services.audit import write_audit_log

router = APIRouter(tags=["Manage Booking"])

class CancelBookingRequest(BaseModel):
    reason: str = ""

class RescheduleBookingRequest(BaseModel):
    new_slot_start_utc: datetime


def get_booking_by_token(token: str):
    supabase = get_supabase_client()
    tok_resp = supabase.table("booking_tokens").select("booking_id").eq("token", token).execute()
    if not tok_resp.data:
        raise HTTPException(status_code=404, detail="Token not found or invalid.")
        
    booking_id = tok_resp.data[0]["booking_id"]
    
    # Update used_at non-blocking
    supabase.table("booking_tokens").update({"used_at": datetime.now(timezone.utc).isoformat()}).eq("token", token).execute()
    
    b_resp = supabase.table("bookings").select(
        "id, organization_id, team_id, temporary_page_id, assigned_member_id, "
        "start_time_utc, end_time_utc, duration_minutes, status, google_meet_link, google_event_id, "
        "caller_name, caller_email, caller_timezone, custom_form_responses"
    ).eq("id", booking_id).execute()
    
    if not b_resp.data:
        raise HTTPException(status_code=404, detail="Booking not found.")
        
    return b_resp.data[0]


@router.get("/manage/{token}")
@limiter.limit("10/minute")
def get_booking_details(request: Request, token: str):
    supabase = get_supabase_client()
    booking = get_booking_by_token(token)
    
    # Fetch team
    t_resp = supabase.table("teams").select("name, slug").eq("id", booking.get("team_id")).execute()
    team_name = t_resp.data[0]["name"] if t_resp.data else "Unknown Team"
    team_slug = t_resp.data[0]["slug"] if t_resp.data else ""
    
    # Fetch member
    m_resp = supabase.table("members").select("full_name").eq("id", booking.get("assigned_member_id")).execute()
    member_name = m_resp.data[0]["full_name"] if m_resp.data else "Unknown Member"

    end_dt = datetime.fromisoformat(booking["end_time_utc"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    
    is_actionable = True
    reason = None
    
    if booking["status"] == "cancelled":
        is_actionable = False
        reason = "already_cancelled"
    elif booking["status"] == "rescheduled":
        is_actionable = False
        reason = "already_rescheduled"
    elif end_dt < now:
        is_actionable = False
        reason = "meeting_passed"
        
    return {
        "booking_id": booking["id"],
        "team_slug": team_slug,
        "team_name": team_name,
        "assigned_member_name": member_name,
        "start_time": booking["start_time_utc"],
        "end_time": booking["end_time_utc"],
        "duration_minutes": booking["duration_minutes"],
        "caller_name": booking["caller_name"],
        "caller_email": booking["caller_email"],
        "google_meet_link": booking.get("google_meet_link"),
        "calendar_sync_status": "verified" if booking.get("google_meet_link") else "pending",
        "status": booking["status"],
        "actionable": is_actionable,
        "inactionable_reason": reason
    }


@router.post("/manage/{token}/cancel")
@limiter.limit("10/minute")
def cancel_booking(request: Request, token: str, req: CancelBookingRequest):
    booking = get_booking_by_token(token)
    
    end_dt = datetime.fromisoformat(booking["end_time_utc"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    
    if booking["status"] in ("cancelled", "rescheduled") or end_dt < now:
        raise HTTPException(status_code=409, detail="Cannot cancel something already inactive.")
        
    supabase = get_supabase_client()
    b_id = booking["id"]
    now_iso = now.isoformat()
    
    # 1. Update DB
    supabase.table("bookings").update({
        "status": "cancelled",
        "cancelled_at": now_iso,
        "cancellation_reason": req.reason
    }).eq("id", b_id).execute()
    
    # 2. Cancel Calendar Event (non-blocking)
    if booking.get("google_event_id") and booking.get("assigned_member_id"):
        cancel_calendar_event(UUID(booking["assigned_member_id"]), booking["google_event_id"])
        
    # 3. Queue Notifications
    queue_cancellation_notifications(UUID(b_id))
    
    # 4. Audit Log
    write_audit_log(
        organization_id=booking["organization_id"],
        action="booking_cancelled",
        actor_type="caller",
        actor_member_id=None,
        entity_type="booking",
        entity_id=b_id,
        before_state={"status": "confirmed"},
        after_state={"status": "cancelled", "reason": req.reason}
    )
    
    return {"success": True, "message": "Booking cancelled successfully."}


@router.post("/manage/{token}/reschedule")
@limiter.limit("10/minute")
def reschedule_booking(request: Request, token: str, req: RescheduleBookingRequest):
    import uuid
    booking = get_booking_by_token(token)
    
    end_dt = datetime.fromisoformat(booking["end_time_utc"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    
    if booking["status"] in ("cancelled", "rescheduled") or end_dt < now:
        raise HTTPException(status_code=409, detail="Cannot reschedule something already inactive.")
        
    supabase = get_supabase_client()
    old_b_id = booking["id"]
    
    # Generate new Idempotency key implicitly for the new booking to ensure it inserts safely
    new_idempotency_key = f"resched_{uuid.uuid4()}"
    
    try:
        new_booking = create_rescheduled_booking(booking, req.new_slot_start_utc, new_idempotency_key)
    except SlotNoLongerAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
        
    new_b_id = new_booking["id"]
    
    # Mark old booking as rescheduled
    supabase.table("bookings").update({
        "status": "rescheduled"
    }).eq("id", old_b_id).execute()
    
    # Calendar Sync
    if booking.get("google_event_id") and booking.get("assigned_member_id"):
        cancel_calendar_event(UUID(booking["assigned_member_id"]), booking["google_event_id"])
        
    sync_booking_to_calendar(UUID(new_b_id))
    
    # Notifications
    queue_reschedule_notifications(UUID(old_b_id), UUID(new_b_id))
    
    # Re-fetch new booking for frontend mapping
    b_resp = supabase.table("bookings").select(
        "start_time_utc, end_time_utc, google_meet_link"
    ).eq("id", new_b_id).execute()
    new_b = b_resp.data[0] if b_resp.data else {}
    
    return {
        "success": True, 
        "new_booking": {
            "start_time": new_b.get("start_time_utc"),
            "end_time": new_b.get("end_time_utc"),
            "google_meet_link": new_b.get("google_meet_link"),
            "calendar_sync_status": "verified" if new_b.get("google_meet_link") else "pending"
        }
    }

