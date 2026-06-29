"""
Availability Engine Core.

Resolves member availability config by cascading overrides,
and generates theoretical time slots based on the schedule,
date blocks, and booking rules.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Any
from uuid import UUID

import zoneinfo

from app.models.availability import AvailabilityConfig, TimeSlot, AvailabilityResult
from app.services.supabase import get_supabase_client
from app.auth.calendar_auth import get_authenticated_calendar_client, CalendarNotConnectedError

class FreeBusyCheckFailedError(Exception):
    """Raised when the Google Calendar Free/Busy API call fails."""
    pass


def resolve_member_availability_config(member_id: UUID) -> AvailabilityConfig:
    """
    Resolves the availability configuration for a member.
    Cascade order (highest to lowest priority):
    1. member_availability_overrides
    2. team_availability_overrides
    3. org_availability_defaults
    """
    supabase = get_supabase_client()
    
    # Get org_id, team_id
    member_resp = supabase.table("members").select("organization_id, team_id").eq("id", str(member_id)).execute()
    if not member_resp.data:
        raise ValueError(f"Member {member_id} not found")
        
    org_id = member_resp.data[0]["organization_id"]
    team_id = member_resp.data[0].get("team_id")
    
    org_conf_resp = supabase.table("org_availability_defaults").select("*").eq("organization_id", org_id).execute()
    org_conf = org_conf_resp.data[0] if org_conf_resp.data else {}
    
    team_conf = {}
    if team_id:
        team_conf_resp = supabase.table("team_availability_overrides").select("*").eq("team_id", str(team_id)).execute()
        team_conf = team_conf_resp.data[0] if team_conf_resp.data else {}
        
    member_conf_resp = supabase.table("member_availability_overrides").select("*").eq("member_id", str(member_id)).execute()
    member_conf = member_conf_resp.data[0] if member_conf_resp.data else {}
    
    fields = [
        "timezone", 
        "weekly_schedule", 
        "buffer_minutes", 
        "min_notice_minutes", 
        "max_booking_window_days"
    ]
    
    merged = {}
    for f in fields:
        if member_conf.get(f) is not None:
            merged[f] = member_conf[f]
        elif team_conf.get(f) is not None:
            merged[f] = team_conf[f]
        elif org_conf.get(f) is not None:
            merged[f] = org_conf[f]
        else:
            raise ValueError(f"Missing required availability field: {f} after resolving cascade.")
            
    return AvailabilityConfig(**merged)

def resolve_team_availability_config(team_id: UUID) -> AvailabilityConfig:
    """
    Resolves the availability configuration for a team.
    Cascade order (highest to lowest priority):
    1. team_availability_overrides
    2. org_availability_defaults
    """
    supabase = get_supabase_client()
    
    # Get org_id
    team_resp = supabase.table("teams").select("organization_id").eq("id", str(team_id)).execute()
    if not team_resp.data:
        raise ValueError(f"Team {team_id} not found")
        
    org_id = team_resp.data[0]["organization_id"]
    
    org_conf_resp = supabase.table("org_availability_defaults").select("*").eq("organization_id", org_id).execute()
    org_conf = org_conf_resp.data[0] if org_conf_resp.data else {}
    
    team_conf_resp = supabase.table("team_availability_overrides").select("*").eq("team_id", str(team_id)).execute()
    team_conf = team_conf_resp.data[0] if team_conf_resp.data else {}
    
    fields = [
        "timezone", 
        "weekly_schedule", 
        "buffer_minutes", 
        "min_notice_minutes", 
        "max_booking_window_days"
    ]
    
    merged = {}
    for f in fields:
        if team_conf.get(f) is not None:
            merged[f] = team_conf[f]
        elif org_conf.get(f) is not None:
            merged[f] = org_conf[f]
        else:
            raise ValueError(f"Missing required availability field: {f} after resolving cascade.")
            
    return AvailabilityConfig(**merged)

def get_member_date_blocks(member_id: UUID, start_date: date, end_date: date) -> List[Dict[str, Any]]:
    """
    Returns all member_date_blocks rows for that member within the given date range.
    """
    supabase = get_supabase_client()
    blocks = (
        supabase.table("member_date_blocks")
        .select("*")
        .eq("member_id", str(member_id))
        .gte("block_date", start_date.isoformat())
        .lte("block_date", end_date.isoformat())
        .execute()
    )
    return blocks.data


def get_existing_bookings(member_id: UUID, range_start: date, range_end: date) -> List[Dict[str, datetime]]:
    """
    Returns confirmed existing bookings in the system for a member.
    """
    supabase = get_supabase_client()
    
    start_dt = datetime.combine(range_start, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(range_end, datetime.max.time(), tzinfo=timezone.utc)
    
    resp = (
        supabase.table("bookings")
        .select("start_time_utc, end_time_utc")
        .eq("assigned_member_id", str(member_id))
        .eq("status", "confirmed")
        .gte("start_time_utc", start_dt.isoformat())
        .lte("start_time_utc", end_dt.isoformat())
        .execute()
    )
    
    blocks = []
    if resp.data:
        for b in resp.data:
            blocks.append({
                "start_time_utc": datetime.fromisoformat(b["start_time_utc"].replace("Z", "+00:00")),
                "end_time_utc": datetime.fromisoformat(b["end_time_utc"].replace("Z", "+00:00"))
            })
    return blocks


def get_google_freebusy(member_id: UUID, range_start: date, range_end: date) -> List[Dict[str, datetime]]:
    """
    Queries Google Calendar FreeBusy API for the primary calendar.
    Propagates CalendarNotConnectedError.
    Raises FreeBusyCheckFailedError on API network/Google errors.
    """
    import requests
    
    # This will propagate CalendarNotConnectedError naturally if not connected/expired
    credentials = get_authenticated_calendar_client(member_id)
    
    start_dt = datetime.combine(range_start, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(range_end, datetime.max.time(), tzinfo=timezone.utc)
    
    url = "https://www.googleapis.com/calendar/v3/freeBusy"
    body = {
        "timeMin": start_dt.isoformat(),
        "timeMax": end_dt.isoformat(),
        "items": [{"id": "primary"}]
    }
    
    try:
        response = requests.post(
            url, 
            json=body, 
            headers={"Authorization": f"Bearer {credentials.token}"},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        blocks = []
        calendars = data.get("calendars", {})
        primary = calendars.get("primary", {})
        busy = primary.get("busy", [])
        
        for b in busy:
            blocks.append({
                "start_time_utc": datetime.fromisoformat(b["start"].replace("Z", "+00:00")),
                "end_time_utc": datetime.fromisoformat(b["end"].replace("Z", "+00:00"))
            })
            
        return blocks
    except Exception as exc:
        raise FreeBusyCheckFailedError("Failed to fetch free/busy data from Google Calendar") from exc


def generate_available_slots(
    member_id: UUID, 
    duration_minutes: int, 
    range_start: date, 
    range_end: date,
    external_blocks: List[Dict[str, datetime]] = None
) -> List[TimeSlot]:
    """
    Generates theoretical available time slots based on the member's resolved availability config,
    date blocks, and an optional list of external busy blocks (e.g. Google Free/Busy + existing bookings).
    """
    if external_blocks is None:
        external_blocks = []
        
    config = resolve_member_availability_config(member_id)
    blocks = get_member_date_blocks(member_id, range_start, range_end)
    
    try:
        tz = zoneinfo.ZoneInfo(config.timezone)
    except zoneinfo.ZoneInfoNotFoundError:
        tz = timezone.utc
        
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(tz)
    
    # Max booking window limit
    max_date = now_local.date() + timedelta(days=config.max_booking_window_days)
    if range_end > max_date:
        range_end = max_date
        
    if range_start > range_end:
        return []
        
    weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    
    # Map blocks by date
    block_map = {}
    for b in blocks:
        # e.g., '2026-06-25'
        bd = datetime.strptime(b["block_date"], "%Y-%m-%d").date()
        block_map.setdefault(bd, []).append(b)
        
    # Get schedule dict
    schedule_dict = config.weekly_schedule.model_dump()
    
    slots = []
    
    current_date = range_start
    while current_date <= range_end:
        wd_str = weekdays[current_date.weekday()]
        day_schedule = schedule_dict.get(wd_str, [])
        day_blocks = block_map.get(current_date, [])
        
        # If any full-day block exists, skip the entire day
        if any(b.get("is_full_day") for b in day_blocks):
            current_date += timedelta(days=1)
            continue
            
        # Parse partial blocks
        partial_blocks = []
        for b in day_blocks:
            if not b.get("is_full_day") and b.get("partial_start_time") and b.get("partial_end_time"):
                # Time strings like "14:00:00"
                try:
                    st = datetime.strptime(b["partial_start_time"], "%H:%M:%S").time()
                    et = datetime.strptime(b["partial_end_time"], "%H:%M:%S").time()
                except ValueError:
                    st = datetime.strptime(b["partial_start_time"], "%H:%M").time()
                    et = datetime.strptime(b["partial_end_time"], "%H:%M").time()
                partial_blocks.append((st, et))
                
        for time_range in day_schedule:
            if not time_range or len(time_range) != 2:
                continue
                
            start_str, end_str = time_range
            try:
                st_time = datetime.strptime(start_str, "%H:%M").time()
                et_time = datetime.strptime(end_str, "%H:%M").time()
            except ValueError:
                st_time = datetime.strptime(start_str, "%H:%M:%S").time()
                et_time = datetime.strptime(end_str, "%H:%M:%S").time()
                
            # Combine to aware datetimes
            range_start_dt = datetime.combine(current_date, st_time, tzinfo=tz)
            range_end_dt = datetime.combine(current_date, et_time, tzinfo=tz)
            
            slot_start = range_start_dt
            
            while slot_start + timedelta(minutes=duration_minutes) <= range_end_dt:
                slot_end = slot_start + timedelta(minutes=duration_minutes)
                
                is_valid = True
                
                # Check min notice
                if slot_start < now_utc + timedelta(minutes=config.min_notice_minutes):
                    is_valid = False
                    
                # Check partial blocks
                if is_valid:
                    slot_start_time = slot_start.time()
                    slot_end_time = slot_end.time()
                    for b_st, b_et in partial_blocks:
                        # Overlap: slot_start < b_et AND slot_end > b_st
                        if slot_start_time < b_et and slot_end_time > b_st:
                            is_valid = False
                            break
                            
                # Check external blocks (existing bookings, google freebusy)
                if is_valid and external_blocks:
                    slot_st_utc = slot_start.astimezone(timezone.utc)
                    slot_et_utc = slot_end.astimezone(timezone.utc)
                    
                    for b in external_blocks:
                        b_st = b["start_time_utc"]
                        b_et = b["end_time_utc"]
                        # Overlap: slot_st < b_et AND slot_et > b_st
                        if slot_st_utc < b_et and slot_et_utc > b_st:
                            is_valid = False
                            break
                            
                if is_valid:
                    slots.append(TimeSlot(
                        start_time_utc=slot_start.astimezone(timezone.utc),
                        end_time_utc=slot_end.astimezone(timezone.utc)
                    ))
                    
                # Step forward
                slot_start = slot_end + timedelta(minutes=config.buffer_minutes)
                
        current_date += timedelta(days=1)
        
    return slots


def get_available_slots_for_member(
    member_id: UUID, 
    duration_minutes: int, 
    range_start: date, 
    range_end: date
) -> AvailabilityResult:
    """
    Top-level wrapper that computes final availability.
    Includes theoretical config slots, member_date_blocks,
    existing confirmed bookings, and Google Calendar Free/Busy.
    
    If Google FreeBusy check fails (but token is valid), returns the slots
    computed so far but flags the result as degraded.
    Propagates CalendarNotConnectedError.
    """
    existing_blocks = get_existing_bookings(member_id, range_start, range_end)
    
    google_blocks = []
    is_degraded = False
    error_message = None
    
    try:
        google_blocks = get_google_freebusy(member_id, range_start, range_end)
    except FreeBusyCheckFailedError as e:
        is_degraded = True
        error_message = str(e)
        
    all_external_blocks = existing_blocks + google_blocks
    
    slots = generate_available_slots(
        member_id, 
        duration_minutes, 
        range_start, 
        range_end, 
        external_blocks=all_external_blocks
    )
    
    return AvailabilityResult(
        slots=slots,
        is_degraded=is_degraded,
        error_message=error_message
    )
