"""
Action Items routes.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
from uuid import UUID
from pydantic import BaseModel

from app.dependencies.auth import get_current_member
from app.models.member import Member, MemberRole
from app.services.supabase import get_supabase_client

router = APIRouter(tags=["Action Items"])

class ActionItemUpdate(BaseModel):
    is_done: bool

@router.patch("/action-items/{item_id}")
async def update_action_item(
    item_id: UUID,
    request: ActionItemUpdate,
    member: Member = Depends(get_current_member)
):
    supabase = get_supabase_client()
    
    # Fetch action item and associated booking info for authorization
    resp = supabase.table("meeting_action_items").select("*, bookings(assigned_member_id, organization_id, team_id)").eq("id", str(item_id)).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Action item not found")
        
    item = resp.data[0]
    booking = item.get("bookings")
    if not booking:
        raise HTTPException(status_code=500, detail="Action item orphaned")
        
    # Authorization checks
    is_assigned = booking.get("assigned_member_id") == str(member.id)
    
    is_admin_match = False
    if member.role == MemberRole.SUPER_ADMIN:
        is_admin_match = booking.get("organization_id") == str(member.organization_id)
    elif member.role == MemberRole.TEAM_ADMIN:
        is_admin_match = (
            booking.get("organization_id") == str(member.organization_id) and 
            booking.get("team_id") == str(member.team_id)
        )
        
    if not (is_assigned or is_admin_match):
        raise HTTPException(status_code=403, detail="Not authorized to update this action item")
        
    # Perform update
    upd_resp = supabase.table("meeting_action_items").update({
        "is_done": request.is_done
    }).eq("id", str(item_id)).execute()
    
    if not upd_resp.data:
        raise HTTPException(status_code=500, detail="Failed to update action item")
        
    return upd_resp.data[0]
