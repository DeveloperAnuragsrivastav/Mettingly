"""
Booking Engine Core.

Handles round-robin member assignment, idempotency, race condition retries,
and booking creation.
"""
from datetime import datetime, date, timedelta, timezone
from typing import Dict, List, Optional
from uuid import UUID

from app.services.supabase import get_supabase_client
from app.services.team_availability import get_eligible_members_for_team, get_eligible_members_for_org
from app.services.availability import get_available_slots_for_member
from app.services.audit import write_audit_log


class SlotNoLongerAvailableError(Exception):
    """Raised when the selected slot is no longer available across the eligible member pool."""
    pass


def select_least_busy_member(eligible_member_ids: List[UUID], slot_start: datetime, slot_end: datetime) -> Optional[UUID]:
    """
    Selects the least busy member from the pool based on the number of confirmed bookings
    in the current week. Tie-breaks using the furthest-past oldest booking.
    """
    if not eligible_member_ids:
        return None
        
    supabase = get_supabase_client()
    
    # Define window: start of current week (Monday)
    now = datetime.now(timezone.utc)
    start_of_week = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Query all confirmed bookings for these members in the window
    resp = (
        supabase.table("bookings")
        .select("assigned_member_id, start_time_utc")
        .in_("assigned_member_id", [str(m) for m in eligible_member_ids])
        .eq("status", "confirmed")
        .gte("start_time_utc", start_of_week.isoformat())
        .execute()
    )
    
    stats = {m: {"count": 0, "oldest_booking": None} for m in eligible_member_ids}
    
    for b in resp.data:
        m_id = UUID(b["assigned_member_id"])
        if m_id not in stats:
            continue
        stats[m_id]["count"] += 1
        
        b_time = datetime.fromisoformat(b["start_time_utc"].replace("Z", "+00:00"))
        if stats[m_id]["oldest_booking"] is None or b_time < stats[m_id]["oldest_booking"]:
            stats[m_id]["oldest_booking"] = b_time
            
    def sort_key(m_id):
        count = stats[m_id]["count"]
        oldest = stats[m_id]["oldest_booking"]
        oldest_ts = oldest.timestamp() if oldest else 0.0
        return (count, oldest_ts)
        
    sorted_members = sorted(eligible_member_ids, key=sort_key)
    return sorted_members[0]


def create_booking(
    team_id: Optional[UUID], 
    temporary_page_id: Optional[UUID], 
    duration_minutes: int, 
    slot_start_utc: datetime, 
    caller_name: str, 
    caller_email: str, 
    caller_timezone: str, 
    custom_form_responses: dict, 
    idempotency_key: str
) -> dict:
    
    if bool(team_id) == bool(temporary_page_id):
        raise ValueError("Exactly one of team_id or temporary_page_id must be provided.")
        
    supabase = get_supabase_client()
    
    # 1. Idempotency check
    existing_resp = supabase.table("bookings").select("*").eq("idempotency_key", idempotency_key).execute()
    if existing_resp.data:
        return existing_resp.data[0]
        
    # 2. Determine eligible pool
    org_id = None
    if temporary_page_id:
        page_resp = supabase.table("temporary_booking_pages").select("organization_id").eq("id", str(temporary_page_id)).execute()
        if not page_resp.data:
            raise ValueError("Temporary page not found")
        org_id = UUID(page_resp.data[0]["organization_id"])
        eligible_pool = get_eligible_members_for_org(org_id)
    else:
        team_resp = supabase.table("teams").select("organization_id").eq("id", str(team_id)).execute()
        if not team_resp.data:
            raise ValueError("Team not found")
        org_id = UUID(team_resp.data[0]["organization_id"])
        eligible_pool = get_eligible_members_for_team(team_id)
        
    slot_end_utc = slot_start_utc + timedelta(minutes=duration_minutes)
    
    # 3. Re-verify actual availability to minimize race window
    verified_pool = []
    range_start = slot_start_utc.date()
    range_end = slot_end_utc.date()
    
    for m_id in eligible_pool:
        avail_res = get_available_slots_for_member(m_id, duration_minutes, range_start, range_end)
        
        is_free = False
        for s in avail_res.slots:
            if s.start_time_utc == slot_start_utc and s.end_time_utc == slot_end_utc:
                is_free = True
                break
                
        if is_free:
            verified_pool.append(m_id)
            
    if not verified_pool:
        raise SlotNoLongerAvailableError("This slot was just taken, please pick another.")
        
    # 4. Selection and Insertion
    assigned_m_id = select_least_busy_member(verified_pool, slot_start_utc, slot_end_utc)
    
    booking_data = {
        "organization_id": str(org_id),
        "team_id": str(team_id) if team_id else None,
        "assigned_member_id": str(assigned_m_id),
        "temporary_page_id": str(temporary_page_id) if temporary_page_id else None,
        "caller_name": caller_name,
        "caller_email": caller_email,
        "caller_timezone": caller_timezone,
        "custom_form_responses": custom_form_responses,
        "start_time_utc": slot_start_utc.isoformat(),
        "end_time_utc": slot_end_utc.isoformat(),
        "duration_minutes": duration_minutes,
        "status": "confirmed",
        "idempotency_key": idempotency_key,
        "calendar_sync_status": "pending"
    }
    
    try:
        insert_resp = supabase.table("bookings").insert(booking_data).execute()
        new_booking = insert_resp.data[0]
        
        write_audit_log(
            organization_id=str(org_id),
            action="booking_created",
            actor_type="caller",
            actor_member_id=None,
            entity_type="booking",
            entity_id=new_booking["id"],
            before_state=None,
            after_state={
                "assigned_member_id": str(assigned_m_id),
                "start_time_utc": slot_start_utc.isoformat(),
                "status": "confirmed"
            }
        )
        return new_booking
        
    except Exception as e:
        err_msg = str(e).lower()
        if "exclude" in err_msg or "violates" in err_msg or "overlapping" in err_msg:
            # 5. Handle Race Condition: EXCLUDE constraint triggered.
            # Retry entire selection once against remaining pool.
            verified_pool.remove(assigned_m_id)
            if not verified_pool:
                raise SlotNoLongerAvailableError("This slot was just taken, please pick another.")
                
            assigned_m_id = select_least_busy_member(verified_pool, slot_start_utc, slot_end_utc)
            booking_data["assigned_member_id"] = str(assigned_m_id)
            
            try:
                insert_resp2 = supabase.table("bookings").insert(booking_data).execute()
                new_booking2 = insert_resp2.data[0]
                
                write_audit_log(
                    organization_id=str(org_id),
                    action="booking_created",
                    actor_type="caller",
                    actor_member_id=None,
                    entity_type="booking",
                    entity_id=new_booking2["id"],
                    before_state=None,
                    after_state={
                        "assigned_member_id": str(assigned_m_id),
                        "start_time_utc": slot_start_utc.isoformat(),
                        "status": "confirmed"
                    }
                )
                return new_booking2
            except Exception:
                raise SlotNoLongerAvailableError("This slot was just taken, please pick another.")
        else:
            raise


def create_rescheduled_booking(
    old_booking: dict,
    new_slot_start_utc: datetime,
    idempotency_key: str
) -> dict:
    supabase = get_supabase_client()
    
    assigned_m_id = UUID(old_booking["assigned_member_id"])
    duration_minutes = old_booking["duration_minutes"]
    org_id = UUID(old_booking["organization_id"])
    
    new_slot_end_utc = new_slot_start_utc + timedelta(minutes=duration_minutes)
    
    # Verify availability
    avail_res = get_available_slots_for_member(assigned_m_id, duration_minutes, new_slot_start_utc.date(), new_slot_end_utc.date())
    
    is_free = False
    for s in avail_res.slots:
        if s.start_time_utc == new_slot_start_utc and s.end_time_utc == new_slot_end_utc:
            is_free = True
            break
            
    if not is_free:
        raise SlotNoLongerAvailableError("This new time is no longer available, please pick another.")
        
    booking_data = {
        "organization_id": str(org_id),
        "team_id": old_booking.get("team_id"),
        "assigned_member_id": str(assigned_m_id),
        "temporary_page_id": old_booking.get("temporary_page_id"),
        "caller_name": old_booking["caller_name"],
        "caller_email": old_booking["caller_email"],
        "caller_timezone": old_booking["caller_timezone"],
        "custom_form_responses": old_booking.get("custom_form_responses", {}),
        "start_time_utc": new_slot_start_utc.isoformat(),
        "end_time_utc": new_slot_end_utc.isoformat(),
        "duration_minutes": duration_minutes,
        "status": "confirmed",
        "idempotency_key": idempotency_key,
        "calendar_sync_status": "pending",
        "rescheduled_from_booking_id": old_booking["id"]
    }
    
    try:
        insert_resp = supabase.table("bookings").insert(booking_data).execute()
        new_booking = insert_resp.data[0]
        
        write_audit_log(
            organization_id=str(org_id),
            action="booking_rescheduled",
            actor_type="caller",
            actor_member_id=None,
            entity_type="booking",
            entity_id=new_booking["id"],
            before_state={
                "old_booking_id": old_booking["id"],
                "old_start_time": old_booking["start_time_utc"]
            },
            after_state={
                "new_start_time": new_slot_start_utc.isoformat()
            }
        )
        return new_booking
        
    except Exception as e:
        err_msg = str(e).lower()
        if "exclude" in err_msg or "violates" in err_msg or "overlapping" in err_msg:
            raise SlotNoLongerAvailableError("This new time is no longer available, please pick another.")
        else:
            raise

