from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime, date, timezone
from uuid import UUID

from app.limiter import limiter
from app.services.supabase import get_supabase_client
from app.services.team_availability import get_aggregated_team_slots, get_aggregated_org_slots
from app.services.booking_engine import create_booking, SlotNoLongerAvailableError
from app.services.calendar_sync import sync_booking_to_calendar
from app.services.notifications import queue_booking_confirmation_notifications, queue_reminder_notifications

router = APIRouter(tags=["Public Booking"])

class PublicBookingRequest(BaseModel):
    duration_minutes: Optional[int] = None # Optional because campaign forces it
    slot_start_utc: datetime
    caller_name: str
    caller_email: str
    caller_timezone: str
    custom_form_responses: Dict = {}
    idempotency_key: str

def check_campaign_expiry(page: dict):
    if not page.get("is_active"):
        raise HTTPException(status_code=410, detail={"expired": True, "reason": page.get("deactivation_reason") or "inactive"})
        
    expiry_type = page.get("expiry_type")
    
    if expiry_type == "date":
        exp_date_str = page.get("expiry_date_utc")
        if exp_date_str:
            exp_date = datetime.fromisoformat(exp_date_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_date:
                raise HTTPException(status_code=410, detail={"expired": True, "reason": "past_expiry_date"})
                
    elif expiry_type == "after_bookings":
        current = page.get("current_booking_count") or 0
        limit = page.get("expiry_after_bookings") or 0
        if current >= limit:
            raise HTTPException(status_code=410, detail={"expired": True, "reason": "expired_bookings"})


@router.get("/book/{team_slug}/slots")
@limiter.limit("20/minute")
def get_team_slots(request: Request, team_slug: str, duration_minutes: int, range_start: date, range_end: date):
    supabase = get_supabase_client()
    resp = supabase.table("teams").select("id").eq("slug", team_slug).is_("deleted_at", "null").execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Team not found")
        
    team_id = UUID(resp.data[0]["id"])
    return get_aggregated_team_slots(team_id, duration_minutes, range_start, range_end)


@router.post("/book/{team_slug}")
@limiter.limit("5/minute")
def create_team_booking(request: Request, team_slug: str, req: PublicBookingRequest):
    if not req.duration_minutes:
        raise HTTPException(status_code=400, detail="duration_minutes is required for team bookings")
        
    supabase = get_supabase_client()
    resp = supabase.table("teams").select("id").eq("slug", team_slug).is_("deleted_at", "null").execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Team not found")
        
    team_id = UUID(resp.data[0]["id"])
    
    try:
        booking = create_booking(
            team_id=team_id,
            temporary_page_id=None,
            duration_minutes=req.duration_minutes,
            slot_start_utc=req.slot_start_utc,
            caller_name=req.caller_name,
            caller_email=req.caller_email,
            caller_timezone=req.caller_timezone,
            custom_form_responses=req.custom_form_responses,
            idempotency_key=req.idempotency_key
        )
    except SlotNoLongerAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    b_id = UUID(booking["id"])
    
    # Generate Notifications
    queue_booking_confirmation_notifications(b_id)
    queue_reminder_notifications(b_id)
        
    sync_result = sync_booking_to_calendar(b_id)
    
    return {
        "booking": booking,
        "calendar_sync": sync_result
    }


@router.get("/campaign/{page_slug}/slots")
@limiter.limit("20/minute")
def get_campaign_slots(request: Request, page_slug: str, range_start: date, range_end: date):
    supabase = get_supabase_client()
    resp = supabase.table("temporary_booking_pages").select("*").eq("slug", page_slug).is_("deleted_at", "null").execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    page = resp.data[0]
    check_campaign_expiry(page)
    
    org_id = UUID(page["organization_id"])
    duration = page.get("duration_minutes") or 30
    
    return get_aggregated_org_slots(org_id, duration, range_start, range_end)


@router.post("/campaign/{page_slug}")
@limiter.limit("5/minute")
def create_campaign_booking(request: Request, page_slug: str, req: PublicBookingRequest):
    supabase = get_supabase_client()
    resp = supabase.table("temporary_booking_pages").select("*").eq("slug", page_slug).is_("deleted_at", "null").execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    page = resp.data[0]
    check_campaign_expiry(page)
    
    page_id = UUID(page["id"])
    duration = page.get("duration_minutes") or 30
    
    try:
        booking = create_booking(
            team_id=None,
            temporary_page_id=page_id,
            duration_minutes=duration,
            slot_start_utc=req.slot_start_utc,
            caller_name=req.caller_name,
            caller_email=req.caller_email,
            caller_timezone=req.caller_timezone,
            custom_form_responses=req.custom_form_responses,
            idempotency_key=req.idempotency_key
        )
    except SlotNoLongerAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    # Increment count for after_bookings
    if page.get("expiry_type") == "after_bookings":
        current_count = (page.get("current_booking_count") or 0) + 1
        limit = page.get("expiry_after_bookings") or 0
        
        updates = {"current_booking_count": current_count}
        if current_count >= limit:
            updates["is_active"] = False
            updates["deactivation_reason"] = "expired_bookings"
            
        supabase.table("temporary_booking_pages").update(updates).eq("id", str(page_id)).execute()
        
    b_id = UUID(booking["id"])
    
    # Generate Notifications
    queue_booking_confirmation_notifications(b_id)
    queue_reminder_notifications(b_id)
        
    sync_result = sync_booking_to_calendar(b_id)
    
    return {
        "booking": booking,
        "calendar_sync": sync_result
    }
