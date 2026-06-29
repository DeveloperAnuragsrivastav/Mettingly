from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from app.dependencies.auth import get_current_member, require_role
from app.models.member import Member, MemberRole
from app.models.team import TeamCreateRequest, TeamUpdateRequest, TeamResponse
from app.services.supabase import get_supabase_client

router = APIRouter(prefix="/teams", tags=["Teams"])

@router.post(
    "",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new team",
)
async def create_team(
    payload: TeamCreateRequest,
    member: Member = Depends(require_role("super_admin")),
) -> TeamResponse:
    supabase = get_supabase_client()

    # Check for duplicate slug
    existing = (
        supabase.table("teams")
        .select("id")
        .eq("organization_id", str(member.organization_id))
        .eq("slug", payload.slug)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A team with this slug already exists.",
        )

    response = (
        supabase.table("teams")
        .insert(
            {
                "organization_id": str(member.organization_id),
                "name": payload.name,
                "slug": payload.slug,
            }
        )
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create team")

    return TeamResponse(**response.data[0])

@router.get(
    "",
    response_model=List[TeamResponse],
    summary="List teams",
)
async def list_teams(
    member: Member = Depends(get_current_member),
) -> List[TeamResponse]:
    supabase = get_supabase_client()
    query = (
        supabase.table("teams")
        .select("*")
        .eq("organization_id", str(member.organization_id))
        .is_("deleted_at", "null")
    )

    if member.role != MemberRole.SUPER_ADMIN:
        if not member.team_id:
            return []
        query = query.eq("id", str(member.team_id))

    response = query.order("created_at").execute()
    return [TeamResponse(**row) for row in response.data]

@router.patch(
    "/{team_id}",
    response_model=TeamResponse,
    summary="Update a team",
)
async def update_team(
    team_id: str,
    payload: TeamUpdateRequest,
    member: Member = Depends(require_role("super_admin")),
) -> TeamResponse:
    supabase = get_supabase_client()

    # Validate ownership
    team = (
        supabase.table("teams")
        .select("organization_id")
        .eq("id", team_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not team.data or str(team.data[0]["organization_id"]) != str(member.organization_id):
        raise HTTPException(status_code=404, detail="Team not found.")

    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.slug is not None:
        existing = (
            supabase.table("teams")
            .select("id")
            .eq("organization_id", str(member.organization_id))
            .eq("slug", payload.slug)
            .neq("id", team_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another team with this slug already exists.",
            )
        updates["slug"] = payload.slug
    if payload.deleted is True:
        updates["deleted_at"] = datetime.now(timezone.utc).isoformat()
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    response = (
        supabase.table("teams")
        .update(updates)
        .eq("id", team_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to update team")

    return TeamResponse(**response.data[0])
