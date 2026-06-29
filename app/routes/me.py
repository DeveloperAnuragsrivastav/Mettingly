"""
Profile routes.

GET /me — returns the authenticated member's profile.
"""

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_member
from app.models.member import Member, MemberProfileResponse
from app.services.supabase import get_supabase_client

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
