from datetime import datetime, timezone
from typing import Dict, List
from uuid import UUID
import requests

from app.services.supabase import get_supabase_client
from app.auth.calendar_auth import get_authenticated_calendar_client, CalendarNotConnectedError


def sync_booking_to_calendar(booking_id: UUID) -> Dict:
    """
    Syncs a confirmed booking to the assigned member's Google Calendar.
    Updates the booking's sync status depending on success or failure.
    Returns the updated booking data or failure state.
    """
    supabase = get_supabase_client()
    now_utc = datetime.now(timezone.utc).isoformat()
    
    # 1. Fetch the booking
    resp = supabase.table("bookings").select("*").eq("id", str(booking_id)).execute()
    if not resp.data:
        raise ValueError(f"Booking {booking_id} not found")
        
    booking = resp.data[0]
    member_id = booking.get("assigned_member_id")
    
    if not member_id:
        raise ValueError("Booking has no assigned member")
        
    member_resp = supabase.table("members").select("email").eq("id", member_id).execute()
    member_email = member_resp.data[0]["email"] if member_resp.data else ""
        
    # 2. Get credentials
    try:
        credentials = get_authenticated_calendar_client(UUID(member_id))
    except CalendarNotConnectedError:
        # Member disconnected before we could sync
        update_data = {
            "calendar_sync_status": "sync_failed",
            "calendar_sync_error": "Member calendar not connected",
            "calendar_sync_attempts": (booking.get("calendar_sync_attempts") or 0) + 1,
            "last_calendar_sync_attempt_at": now_utc
        }
        supabase.table("bookings").update(update_data).eq("id", str(booking_id)).execute()
        return {"success": False, "error": "Member calendar not connected"}
        
    # 3. Build Google Calendar Event Payload
    caller_name = booking.get("caller_name") or "Customer"
    caller_email = booking.get("caller_email")
    
    description = "Booked via Meeting SaaS"
    responses = booking.get("custom_form_responses") or {}
    
    if responses.get("reason"):
        description += f"\n\nReason for meeting:\n{responses['reason']}"
    if responses.get("summary"):
        description += f"\n\nMeeting summary:\n{responses['summary']}"

    event_payload = {
        "summary": f"Meeting with {caller_name}",
        "description": description,
        "start": {
            "dateTime": booking["start_time_utc"],
            "timeZone": "UTC"
        },
        "end": {
            "dateTime": booking["end_time_utc"],
            "timeZone": "UTC"
        },
        "attendees": [
            {"email": member_email},
        ],
        "conferenceData": {
            "createRequest": {
                "requestId": f"meet_{str(booking_id).replace('-', '')[:16]}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"}
            }
        }
    }
    
    if caller_email:
        event_payload["attendees"].append({"email": caller_email})
        
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1"
    
    # 4. Execute Request
    try:
        g_resp = requests.post(
            url,
            json=event_payload,
            headers={"Authorization": f"Bearer {credentials.token}"},
            timeout=15
        )
        g_resp.raise_for_status()
        data = g_resp.json()
        
        google_event_id = data.get("id")
        
        # Extract Meet Link
        meet_link = None
        conf_data = data.get("conferenceData", {})
        for entry in conf_data.get("entryPoints", []):
            if entry.get("entryPointType") == "video":
                meet_link = entry.get("uri")
                break
                
        # 5. Success - Update Booking
        update_data = {
            "calendar_sync_status": "verified",
            "calendar_sync_error": None,
            "calendar_sync_attempts": (booking.get("calendar_sync_attempts") or 0) + 1,
            "last_calendar_sync_attempt_at": now_utc,
            "google_event_id": google_event_id,
            "google_meet_link": meet_link
        }
        supabase.table("bookings").update(update_data).eq("id", str(booking_id)).execute()
        return {"success": True, "google_event_id": google_event_id, "google_meet_link": meet_link}
        
    except Exception as e:
        # 6. Failure - Update Booking safely
        error_msg = str(e)
        if hasattr(e, "response") and getattr(e, "response") is not None:
            error_msg += f" | {e.response.text}"
            
        update_data = {
            "calendar_sync_status": "sync_failed",
            "calendar_sync_error": error_msg[:500],
            "calendar_sync_attempts": (booking.get("calendar_sync_attempts") or 0) + 1,
            "last_calendar_sync_attempt_at": now_utc
        }
        supabase.table("bookings").update(update_data).eq("id", str(booking_id)).execute()
        return {"success": False, "error": error_msg}


def retry_failed_calendar_syncs() -> List[UUID]:
    """
    Finds bookings that failed to sync (attempts < 5) and retries them.
    Returns list of booking IDs that succeeded on retry.
    """
    supabase = get_supabase_client()
    
    resp = (
        supabase.table("bookings")
        .select("id")
        .eq("calendar_sync_status", "sync_failed")
        .eq("status", "confirmed")
        .lt("calendar_sync_attempts", 5)
        .execute()
    )
    
    succeeded = []
    if not resp.data:
        return succeeded
        
    for b in resp.data:
        b_id = UUID(b["id"])
        res = sync_booking_to_calendar(b_id)
        if res.get("success"):
            succeeded.append(b_id)
            
    return succeeded

def cancel_calendar_event(member_id: UUID, google_event_id: str):
    """
    Attempts to cancel a Google Calendar event.
    Failures are logged but not raised.
    """
    try:
        credentials = get_authenticated_calendar_client(member_id)
        url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}?sendUpdates=all"
        resp = requests.delete(
            url,
            headers={"Authorization": f"Bearer {credentials.token}"},
            timeout=10
        )
        resp.raise_for_status()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to cancel Google Calendar event {google_event_id} for member {member_id}: {e}")

