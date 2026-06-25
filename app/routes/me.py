"""
Profile routes.

GET /me — returns the authenticated member's profile.
"""

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_member
from app.models.member import Member, MemberProfileResponse

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
    return MemberProfileResponse(
        id=member.id,
        full_name=member.full_name,
        email=member.email,
        role=member.role,
        team_id=member.team_id,
        organization_id=member.organization_id,
    )
