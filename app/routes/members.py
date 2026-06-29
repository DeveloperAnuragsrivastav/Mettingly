"""
Members management routes.

Endpoints:
    POST   /members/invite       — Invite a new member (creates row with auth_user_id=NULL)
    GET    /members              — List members (role-scoped per ARCHITECTURE.md §4/§11)
    DELETE /members/{member_id}  — Soft-delete a member (set deleted_at = now())

All authorization rules follow ARCHITECTURE.md exactly:
    - Team Admin: can only operate within their own team, cannot assign admin roles.
    - Super Admin: full org-wide access.
    - Member: can only see their own data (GET only).
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.dependencies.auth import get_current_member, require_role
from app.models.member import (
    DeleteMemberResponse,
    Member,
    MemberInviteRequest,
    MemberInviteResponse,
    MemberListItem,
    MemberRole,
    UpdateMemberRoleRequest,
)
from app.services.supabase import get_supabase_client
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["Members"])


# ── Helpers ──────────────────────────────────────────────────────────


def _compute_onboarding_status(auth_user_id) -> str:
    """
    Derive onboarding status from auth_user_id.

    - ``"pending"`` — auth_user_id is NULL (invited but not yet signed up)
    - ``"active"``  — auth_user_id is set (user has signed up and was auto-linked)
    """
    return "active" if auth_user_id is not None else "pending"


# ── POST /members/invite ─────────────────────────────────────────────


@router.post(
    "/invite",
    response_model=MemberInviteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a new member to the organization",
    responses={
        403: {"description": "Insufficient permissions or team-scoping violation"},
        409: {"description": "Email already exists in this organization"},
        422: {"description": "Validation error (e.g., missing team_id for member role)"},
    },
)
async def invite_member(
    body: MemberInviteRequest,
    current_member: Member = Depends(
        require_role("super_admin", "team_admin")
    ),
):
    """
    Create a new member row with ``auth_user_id = NULL`` (invited, not yet onboarded).

    **Authorization rules (per ARCHITECTURE.md §4):**

    - **Team Admin**: can only invite ``role="member"`` into their own team.
      Cannot assign ``super_admin`` or ``team_admin`` roles.
    - **Super Admin**: can invite any role into any team.
      ``team_id`` is nullable only when inviting another ``super_admin``.

    The Postgres trigger ``on_auth_user_created`` will auto-link
    ``auth_user_id`` when the invited person signs up via Supabase Auth
    with a matching email — no backend logic needed for that step.
    """

    # ── Team Admin authorization checks ──────────────────────────────
    if current_member.role == MemberRole.TEAM_ADMIN:
        # Team Admins cannot assign admin roles (ARCHITECTURE.md §4:
        # "only Super Admin can promote/assign Team Admin")
        if body.role in (MemberRole.SUPER_ADMIN, MemberRole.TEAM_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Team Admins can only invite regular members. "
                    "Only Super Admins can assign admin roles."
                ),
            )
        # Team Admins can only invite into their own team
        if body.team_id != current_member.team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Team Admins can only invite members into their own team.",
            )

    # ── Validate team_id requirements ────────────────────────────────
    # Members and Team Admins MUST belong to a team
    if body.role == MemberRole.MEMBER and body.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="team_id is required when inviting a regular member.",
        )
    if body.role == MemberRole.TEAM_ADMIN and body.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="team_id is required when inviting a team admin.",
        )
    # Super Admin: team_id is intentionally nullable (org-level role, not team-bound)

    # ── Insert into members table ────────────────────────────────────
    supabase = get_supabase_client()

    insert_data = {
        "organization_id": str(current_member.organization_id),
        "team_id": str(body.team_id) if body.team_id else None,
        "role": body.role.value,
        "full_name": body.full_name,
        "email": body.email,
        "is_active_for_booking": True,
        "auth_user_id": None,
    }

    try:
        response = supabase.table("members").insert(insert_data).execute()
    except Exception as exc:
        # Handle unique constraint violation on (organization_id, email).
        # PostgreSQL error code 23505 = unique_violation.
        error_str = str(exc).lower()
        if "23505" in error_str or "unique" in error_str or "duplicate" in error_str:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A member with email '{body.email}' already exists "
                    f"in this organization."
                ),
            ) from exc
        raise

    created = response.data[0]

    try:
        from app.config import get_settings
        settings = get_settings()
        
        # Generate the link directly so we can log it (bypasses email delivery issues on free tier)
        link_resp = supabase.auth.admin.generate_link({
            "type": "invite",
            "email": body.email,
            "options": {"redirect_to": f"{settings.FRONTEND_URL}/set-password"}
        })
        invite_link = link_resp.properties.action_link
        
        print("\n" + "="*80)
        print(f"🔗🔗🔗 INVITE LINK FOR {body.email} 🔗🔗🔗")
        print(invite_link)
        print("="*80 + "\n")
        logger.info(f"Invite link for {body.email}: {invite_link}")

        # Use native Supabase Admin invite to attempt sending the email
        supabase.auth.admin.invite_user_by_email(
            email=body.email,
            options={"redirect_to": f"{settings.FRONTEND_URL}/set-password"}
        )
    except Exception as e:
        logger.error(f"Failed to send native Supabase invite for {body.email}: {e}")

    return MemberInviteResponse(
        id=created["id"],
        full_name=created["full_name"],
        email=created["email"],
        role=created["role"],
        team_id=created.get("team_id"),
        organization_id=created["organization_id"],
        onboarding_status="pending",  # Always pending on invite (auth_user_id is NULL)
    )


# ── GET /members ─────────────────────────────────────────────────────


@router.get(
    "",
    response_model=list[MemberListItem],
    summary="List members (role-scoped)",
    responses={
        401: {"description": "Invalid or expired token"},
        403: {"description": "No linked member account"},
    },
)
async def list_members(
    current_member: Member = Depends(get_current_member),
):
    """
    Return members visible to the calling user, scoped by role
    (per ARCHITECTURE.md §4/§11):

    - **Super Admin**: all members in the organization.
    - **Team Admin**: only members in their own team.
    - **Member**: only their own row.

    Each row includes a computed ``onboarding_status`` field:
    ``"pending"`` if the member hasn't signed up yet, ``"active"`` otherwise.
    """
    supabase = get_supabase_client()

    query = (
        supabase.table("members")
        .select(
            "id, organization_id, team_id, role, full_name, email, "
            "is_active_for_booking, auth_user_id"
        )
        .eq("organization_id", str(current_member.organization_id))
        .is_("deleted_at", "null")
    )

    # ── Role-based scoping (ARCHITECTURE.md §4/§11) ─────────────────
    if current_member.role == MemberRole.SUPER_ADMIN:
        pass  # No additional filter — sees entire organization
    elif current_member.role == MemberRole.TEAM_ADMIN:
        query = query.eq("team_id", str(current_member.team_id))
    else:
        # Regular member — only their own row
        query = query.eq("id", str(current_member.id))

    response = query.order("full_name").execute()

    # ── Map rows and compute onboarding_status ───────────────────────
    return [
        MemberListItem(
            id=row["id"],
            organization_id=row["organization_id"],
            team_id=row.get("team_id"),
            role=row["role"],
            full_name=row["full_name"],
            email=row["email"],
            is_active_for_booking=row["is_active_for_booking"],
            onboarding_status=_compute_onboarding_status(row.get("auth_user_id")),
        )
        for row in response.data
    ]


# ── DELETE /members/{member_id} ──────────────────────────────────────


@router.delete(
    "/{member_id}",
    response_model=DeleteMemberResponse,
    summary="Soft-delete a member",
    responses={
        400: {"description": "Cannot delete your own account"},
        403: {"description": "Insufficient permissions or team-scoping violation"},
        404: {"description": "Member not found"},
    },
)
async def soft_delete_member(
    member_id: UUID,
    current_member: Member = Depends(
        require_role("super_admin", "team_admin")
    ),
):
    """
    Soft-delete a member by setting ``deleted_at = now()``.
    Never performs a hard DELETE (per ARCHITECTURE.md soft-delete standardization).

    **Authorization rules:**

    - **Super Admin**: can soft-delete any member in the organization.
    - **Team Admin**: can only soft-delete members in their own team.
    - Neither role can delete themselves.
    """
    supabase = get_supabase_client()

    # ── Fetch target member ──────────────────────────────────────────
    response = (
        supabase.table("members")
        .select("id, organization_id, team_id, role")
        .eq("id", str(member_id))
        .eq("organization_id", str(current_member.organization_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found or already deleted.",
        )

    target = response.data[0]

    # ── Prevent self-deletion ────────────────────────────────────────
    if str(member_id) == str(current_member.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account.",
        )

    # ── Team Admin scoping ───────────────────────────────────────────
    if current_member.role == MemberRole.TEAM_ADMIN:
        target_team_id = target.get("team_id")
        current_team_id = (
            str(current_member.team_id) if current_member.team_id else None
        )
        if target_team_id != current_team_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Team Admins can only delete members in their own team.",
            )

    # ── Soft delete (set deleted_at = now) ───────────────────────────
    supabase.table("members").update(
        {"deleted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", str(member_id)).execute()

    return DeleteMemberResponse(
        detail="Member soft-deleted successfully.",
        member_id=member_id,
    )


# ── PATCH /members/{member_id}/role ──────────────────────────────────


@router.patch(
    "/{member_id}/role",
    response_model=MemberListItem,
    summary="Update a member's role (Super Admin only)",
    responses={
        403: {"description": "Insufficient permissions (must be super_admin)"},
        404: {"description": "Member not found"},
    },
)
async def update_member_role(
    member_id: UUID,
    body: UpdateMemberRoleRequest,
    current_member: Member = Depends(require_role("super_admin")),
):
    """
    Update a member's role.
    Only Super Admins can perform this action.
    """
    supabase = get_supabase_client()

    # ── Fetch target member ──────────────────────────────────────────
    response = (
        supabase.table("members")
        .select("*")
        .eq("id", str(member_id))
        .eq("organization_id", str(current_member.organization_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found or already deleted.",
        )

    target = response.data[0]
    old_role = target["role"]
    new_role = body.new_role.value

    # Skip if no change
    if old_role == new_role:
        return MemberListItem(
            id=target["id"],
            organization_id=target["organization_id"],
            team_id=target.get("team_id"),
            role=target["role"],
            full_name=target["full_name"],
            email=target["email"],
            is_active_for_booking=target["is_active_for_booking"],
            onboarding_status=_compute_onboarding_status(target.get("auth_user_id")),
        )

    # ── Update role ──────────────────────────────────────────────────
    update_resp = (
        supabase.table("members")
        .update({"role": new_role})
        .eq("id", str(member_id))
        .execute()
    )
    
    updated_target = update_resp.data[0]

    # ── Write audit log ──────────────────────────────────────────────
    from app.services.audit import write_audit_log
    write_audit_log(
        organization_id=current_member.organization_id,
        actor_member_id=current_member.id,
        actor_type="member",
        action="member_role_changed",
        entity_type="member",
        entity_id=str(member_id),
        before_state={"role": old_role},
        after_state={"role": new_role},
    )

    return MemberListItem(
        id=updated_target["id"],
        organization_id=updated_target["organization_id"],
        team_id=updated_target.get("team_id"),
        role=updated_target["role"],
        full_name=updated_target["full_name"],
        email=updated_target["email"],
        is_active_for_booking=updated_target["is_active_for_booking"],
        onboarding_status=_compute_onboarding_status(updated_target.get("auth_user_id")),
    )

class MemberToggleActiveRequest(BaseModel):
    is_active_for_booking: bool

@router.patch(
    "/{member_id}/toggle-active",
    response_model=MemberListItem,
    summary="Toggle a member's active for booking status",
    responses={
        403: {"description": "Insufficient permissions or team-scoping violation"},
        404: {"description": "Member not found"},
    },
)
async def toggle_member_active(
    member_id: UUID,
    body: MemberToggleActiveRequest,
    current_member: Member = Depends(require_role("super_admin", "team_admin")),
):
    """
    Toggle the `is_active_for_booking` status of a member.
    Team Admins can only toggle members within their own team.
    Super Admins can toggle any member in the organization.
    """
    supabase = get_supabase_client()

    target_resp = (
        supabase.table("members")
        .select("*")
        .eq("id", str(member_id))
        .eq("organization_id", str(current_member.organization_id))
        .is_("deleted_at", "null")
        .execute()
    )

    if not target_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found.",
        )
    target = target_resp.data[0]

    # Enforce team scope for team admins
    if current_member.role == MemberRole.TEAM_ADMIN:
        if str(target.get("team_id")) != str(current_member.team_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only toggle members in your own team.",
            )

    old_status = target["is_active_for_booking"]
    new_status = body.is_active_for_booking

    if old_status == new_status:
        return MemberListItem(
            id=target["id"],
            organization_id=target["organization_id"],
            team_id=target.get("team_id"),
            role=target["role"],
            full_name=target["full_name"],
            email=target["email"],
            is_active_for_booking=target["is_active_for_booking"],
            onboarding_status=_compute_onboarding_status(target.get("auth_user_id")),
        )

    update_resp = (
        supabase.table("members")
        .update({"is_active_for_booking": new_status})
        .eq("id", str(member_id))
        .execute()
    )
    
    updated_target = update_resp.data[0]

    # Audit log
    from app.services.audit import write_audit_log
    write_audit_log(
        organization_id=current_member.organization_id,
        actor_member_id=current_member.id,
        actor_type="member",
        action="member_active_toggled",
        entity_type="member",
        entity_id=str(member_id),
        before_state={"is_active_for_booking": old_status},
        after_state={"is_active_for_booking": new_status},
    )

    return MemberListItem(
        id=updated_target["id"],
        organization_id=updated_target["organization_id"],
        team_id=updated_target.get("team_id"),
        role=updated_target["role"],
        full_name=updated_target["full_name"],
        email=updated_target["email"],
        is_active_for_booking=updated_target["is_active_for_booking"],
        onboarding_status=_compute_onboarding_status(updated_target.get("auth_user_id")),
    )
