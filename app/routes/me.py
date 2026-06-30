"""
Profile routes.

GET /me — returns the authenticated member's profile.
"""

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_member
from app.models.member import Member, MemberProfileResponse
from app.services.supabase import get_supabase_client
from uuid import UUID
from fastapi import HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone

router = APIRouter(tags=["Profile"])


@router.get(
    "/me",
    response_model=MemberProfileResponse,
    summary="Get current member profile",
    responses={
        401: {"description": "Invalid or expired token"},
        403: {"description": "No linked member account"},
    },
)
async def get_my_profile(
    member: Member = Depends(get_current_member),
) -> MemberProfileResponse:
    """
    Return the authenticated member's profile.

    Requires a valid Supabase Bearer token in the Authorization header.
    The member must have an active (non-deleted) row in the ``members``
    table linked via ``auth_user_id``.
    """
    team_slug = None
    if member.team_id:
        supabase = get_supabase_client()
        res = supabase.table("teams").select("slug").eq("id", member.team_id).limit(1).execute()
        if res.data:
            team_slug = res.data[0]["slug"]

    return MemberProfileResponse(
        id=member.id,
        full_name=member.full_name,
        email=member.email,
        role=member.role,
        team_id=member.team_id,
        team_slug=team_slug,
        organization_id=member.organization_id,
    )


class GenerateFollowupRequest(BaseModel):
    member_notes: str
    regenerate: bool = False

@router.post("/bookings/{booking_id}/generate-followup")
async def generate_followup(
    booking_id: UUID,
    request: GenerateFollowupRequest,
    member: Member = Depends(get_current_member)
):
    supabase = get_supabase_client()
    
    b_resp = supabase.table("bookings").select("assigned_member_id, status, end_time_utc").eq("id", str(booking_id)).execute()
    if not b_resp.data:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    booking = b_resp.data[0]
    
    if booking.get("assigned_member_id") != str(member.id):
        raise HTTPException(status_code=403, detail="You can only generate follow-ups for your own bookings")
        
    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot generate follow-up for a cancelled booking")
        
    end_time_utc = booking.get("end_time_utc")
    if end_time_utc:
        dt = datetime.fromisoformat(end_time_utc.replace("Z", "+00:00"))
        if dt > datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Meeting has not happened yet")
            
    from app.services.ai_engine import generate_insight
    try:
        draft = generate_insight(
            "followup_draft", 
            booking_id, 
            regenerate=request.regenerate, 
            member_notes=request.member_notes
        )
        return draft
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class GenerateNotesRequest(BaseModel):
    member_notes: str
    regenerate: bool = False

@router.post("/bookings/{booking_id}/generate-notes")
async def generate_notes(
    booking_id: UUID,
    request: GenerateNotesRequest,
    member: Member = Depends(get_current_member)
):
    supabase = get_supabase_client()
    
    b_resp = supabase.table("bookings").select("assigned_member_id, status, end_time_utc").eq("id", str(booking_id)).execute()
    if not b_resp.data:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    booking = b_resp.data[0]
    
    if booking.get("assigned_member_id") != str(member.id):
        raise HTTPException(status_code=403, detail="You can only generate notes for your own bookings")
        
    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot generate notes for a cancelled booking")
        
    end_time_utc = booking.get("end_time_utc")
    if end_time_utc:
        dt = datetime.fromisoformat(end_time_utc.replace("Z", "+00:00"))
        if dt > datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Meeting has not happened yet")
            
    from app.services.ai_engine import generate_insight
    try:
        notes = generate_insight(
            "meeting_notes", 
            booking_id, 
            regenerate=request.regenerate, 
            member_notes=request.member_notes
        )
        return notes
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
