from uuid import UUID
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime

from app.dependencies.auth import get_current_member
from app.models.member import Member
from app.models.availability import (
    MemberAvailabilityResponse,
    UpdateMemberAvailabilityRequest,
    AvailabilityOverrideExists,
    CreateDateBlockRequest,
    DateBlockResponse,
    TeamAvailabilityResponse,
    UpdateTeamAvailabilityRequest,
    TeamAvailabilityOverrideExists
)
from app.services.supabase import get_supabase_client
from app.services.availability import resolve_member_availability_config, get_member_date_blocks, resolve_team_availability_config
from app.dependencies.auth import require_role
from app.models.member import MemberRole

router = APIRouter(prefix="/availability", tags=["Availability"])

@router.get("/me", response_model=MemberAvailabilityResponse)
async def get_my_availability(current_member: Member = Depends(get_current_member)):
    """
    Get the current member's resolved availability configuration,
    along with flags indicating which fields they have explicitly overridden.
    """
    supabase = get_supabase_client()
    
    # Get the resolved config
    resolved_config = resolve_member_availability_config(current_member.id)
    
    # Check what the member has overridden
    member_conf_resp = supabase.table("member_availability_overrides").select("*").eq("member_id", str(current_member.id)).execute()
    member_conf = member_conf_resp.data[0] if member_conf_resp.data else {}
    
    override_exists = AvailabilityOverrideExists(
        timezone=member_conf.get("timezone") is not None,
        weekly_schedule=member_conf.get("weekly_schedule") is not None,
        buffer_minutes=member_conf.get("buffer_minutes") is not None,
        min_notice_minutes=member_conf.get("min_notice_minutes") is not None,
        max_booking_window_days=member_conf.get("max_booking_window_days") is not None
    )
    
    return MemberAvailabilityResponse(
        resolved=resolved_config,
        member_override_exists=override_exists
    )

@router.put("/me", response_model=MemberAvailabilityResponse)
async def update_my_availability(
    request: UpdateMemberAvailabilityRequest,
    current_member: Member = Depends(get_current_member)
):
    """
    Update the current member's availability overrides.
    Only provided fields will be updated. Fields explicitly set to None will fall back to inherited values.
    """
    supabase = get_supabase_client()
    
    # Fetch existing overrides
    existing_resp = supabase.table("member_availability_overrides").select("*").eq("member_id", str(current_member.id)).execute()
    existing_data = existing_resp.data[0] if existing_resp.data else {}
    
    update_data = request.dict(exclude_unset=True)
    if "weekly_schedule" in update_data and update_data["weekly_schedule"] is not None:
        # Convert Pydantic WeeklySchedule to dict for Supabase JSONB
        update_data["weekly_schedule"] = update_data["weekly_schedule"]
        
    update_data["last_modified_by_member_id"] = str(current_member.id)
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    if not existing_data:
        update_data["member_id"] = str(current_member.id)
        supabase.table("member_availability_overrides").insert(update_data).execute()
    else:
        supabase.table("member_availability_overrides").update(update_data).eq("id", existing_data["id"]).execute()
        
    # Return updated full state
    return await get_my_availability(current_member)

@router.get("/me/date-blocks", response_model=List[DateBlockResponse])
async def list_my_date_blocks(current_member: Member = Depends(get_current_member)):
    """
    List all date blocks for the current member.
    """
    supabase = get_supabase_client()
    resp = supabase.table("member_date_blocks").select("*").eq("member_id", str(current_member.id)).order("block_date").execute()
    return resp.data

@router.post("/me/date-blocks", response_model=DateBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_date_block(
    request: CreateDateBlockRequest,
    current_member: Member = Depends(get_current_member)
):
    """
    Create a new date block for the current member.
    """
    supabase = get_supabase_client()
    
    insert_data = {
        "member_id": str(current_member.id),
        "block_date": request.block_date.isoformat(),
        "is_full_day": request.is_full_day,
        "partial_start_time": request.partial_start_time.isoformat() if request.partial_start_time else None,
        "partial_end_time": request.partial_end_time.isoformat() if request.partial_end_time else None,
        "reason": request.reason,
        "created_by": str(current_member.id)
    }
    
    resp = supabase.table("member_date_blocks").insert(insert_data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create date block")
        
    return resp.data[0]

@router.delete("/me/date-blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_date_block(
    block_id: UUID,
    current_member: Member = Depends(get_current_member)
):
    """
    Delete a specific date block for the current member.
    """
    supabase = get_supabase_client()
    
    # Verify ownership
    existing = supabase.table("member_date_blocks").select("member_id").eq("id", str(block_id)).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Date block not found")
        
    if existing.data[0]["member_id"] != str(current_member.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this date block")
        
    supabase.table("member_date_blocks").delete().eq("id", str(block_id)).execute()
    return None

@router.get("/team/{team_id}", response_model=TeamAvailabilityResponse)
async def get_team_availability(
    team_id: UUID,
    current_member: Member = Depends(require_role("super_admin", "team_admin"))
):
    """
    Get the resolved availability configuration for a team,
    along with flags indicating which fields are explicitly overridden.
    """
    supabase = get_supabase_client()
    
    # Enforce team scope
    if current_member.role == MemberRole.TEAM_ADMIN and str(current_member.team_id) != str(team_id):
        raise HTTPException(status_code=403, detail="You can only view your own team's availability.")
        
    resolved_config = resolve_team_availability_config(team_id)
    
    team_conf_resp = supabase.table("team_availability_overrides").select("*").eq("team_id", str(team_id)).execute()
    team_conf = team_conf_resp.data[0] if team_conf_resp.data else {}
    
    override_exists = TeamAvailabilityOverrideExists(
        timezone=team_conf.get("timezone") is not None,
        weekly_schedule=team_conf.get("weekly_schedule") is not None,
        buffer_minutes=team_conf.get("buffer_minutes") is not None,
        min_notice_minutes=team_conf.get("min_notice_minutes") is not None,
        max_booking_window_days=team_conf.get("max_booking_window_days") is not None
    )
    
    return TeamAvailabilityResponse(
        resolved=resolved_config,
        team_override_exists=override_exists
    )

@router.put("/team/{team_id}", response_model=TeamAvailabilityResponse)
async def update_team_availability(
    team_id: UUID,
    request: UpdateTeamAvailabilityRequest,
    current_member: Member = Depends(require_role("super_admin", "team_admin"))
):
    """
    Update the team's availability overrides.
    Only provided fields will be updated. Fields explicitly set to None will fall back to inherited values.
    """
    supabase = get_supabase_client()
    
    # Enforce team scope
    if current_member.role == MemberRole.TEAM_ADMIN and str(current_member.team_id) != str(team_id):
        raise HTTPException(status_code=403, detail="You can only edit your own team's availability.")
        
    existing_resp = supabase.table("team_availability_overrides").select("*").eq("team_id", str(team_id)).execute()
    existing_data = existing_resp.data[0] if existing_resp.data else {}
    
    update_data = request.dict(exclude_unset=True)
    if "weekly_schedule" in update_data and update_data["weekly_schedule"] is not None:
        update_data["weekly_schedule"] = update_data["weekly_schedule"]
        
    update_data["last_modified_by_member_id"] = str(current_member.id)
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    if not existing_data:
        update_data["team_id"] = str(team_id)
        supabase.table("team_availability_overrides").insert(update_data).execute()
    else:
        for k, v in update_data.items():
            if v is None:
                update_data[k] = None
        supabase.table("team_availability_overrides").update(update_data).eq("team_id", str(team_id)).execute()
        
    return await get_team_availability(team_id=team_id, current_member=current_member)
