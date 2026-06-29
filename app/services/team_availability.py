"""
Team & Organization-level Availability Aggregator.

Provides public booking page and engine aggregation functions
to calculate union availability across multiple eligible members.
"""

from datetime import date, datetime
from typing import Dict, List
from uuid import UUID

from app.services.supabase import get_supabase_client
from app.auth.calendar_auth import is_member_eligible_for_booking, CalendarNotConnectedError
from app.services.availability import get_available_slots_for_member, FreeBusyCheckFailedError
from app.models.availability import AggregatedAvailabilityResult


def get_eligible_members_for_team(team_id: UUID) -> List[UUID]:
    supabase = get_supabase_client()
    resp = supabase.table("members").select("id").eq("team_id", str(team_id)).is_("deleted_at", "null").execute()
    
    eligible = []
    if resp.data:
        for m in resp.data:
            m_id = UUID(m["id"])
            if is_member_eligible_for_booking(m_id):
                eligible.append(m_id)
                
    return eligible


def get_eligible_members_for_org(organization_id: UUID) -> List[UUID]:
    supabase = get_supabase_client()
    resp = supabase.table("members").select("id").eq("organization_id", str(organization_id)).is_("deleted_at", "null").execute()
    
    eligible = []
    if resp.data:
        for m in resp.data:
            m_id = UUID(m["id"])
            if is_member_eligible_for_booking(m_id):
                eligible.append(m_id)
                
    return eligible


def _aggregate_slots_for_members(
    member_ids: List[UUID], 
    duration_minutes: int, 
    range_start: date, 
    range_end: date
) -> AggregatedAvailabilityResult:
    
    merged_slots: Dict[datetime, List[UUID]] = {}
    skipped_members: Dict[UUID, str] = {}
    
    for m_id in member_ids:
        try:
            avail_res = get_available_slots_for_member(m_id, duration_minutes, range_start, range_end)
            
            if avail_res.is_degraded:
                skipped_members[m_id] = avail_res.error_message or "FreeBusyCheckFailedError"
                continue
                
            for slot in avail_res.slots:
                start_dt = slot.start_time_utc
                if start_dt not in merged_slots:
                    merged_slots[start_dt] = []
                merged_slots[start_dt].append(m_id)
                
        except CalendarNotConnectedError:
            skipped_members[m_id] = "CalendarNotConnectedError"
        except FreeBusyCheckFailedError:
            skipped_members[m_id] = "FreeBusyCheckFailedError"
        except Exception as e:
            skipped_members[m_id] = f"Unexpected Error: {str(e)}"
            
    # Sort merged_slots by datetime
    sorted_slots = {k: merged_slots[k] for k in sorted(merged_slots.keys())}
            
    return AggregatedAvailabilityResult(
        slots=sorted_slots,
        skipped_members=skipped_members
    )


def get_aggregated_team_slots(
    team_id: UUID, 
    duration_minutes: int, 
    range_start: date, 
    range_end: date
) -> AggregatedAvailabilityResult:
    eligible = get_eligible_members_for_team(team_id)
    return _aggregate_slots_for_members(eligible, duration_minutes, range_start, range_end)


def get_aggregated_org_slots(
    organization_id: UUID, 
    duration_minutes: int, 
    range_start: date, 
    range_end: date
) -> AggregatedAvailabilityResult:
    eligible = get_eligible_members_for_org(organization_id)
    return _aggregate_slots_for_members(eligible, duration_minutes, range_start, range_end)
