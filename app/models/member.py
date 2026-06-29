"""
Member domain models.

These Pydantic models represent the member entity as stored in the
`members` Supabase table and as returned by API endpoints.
"""

from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class MemberRole(str, Enum):
    """Allowed role values for a member within an organization."""

    SUPER_ADMIN = "super_admin"
    TEAM_ADMIN = "team_admin"
    MEMBER = "member"


class Member(BaseModel):
    """
    Core member record returned by the auth dependency.

    Represents the subset of `members` table columns needed for
    authentication and authorization decisions.
    """

    id: UUID
    organization_id: UUID
    team_id: Optional[UUID] = None
    role: MemberRole
    full_name: str
    email: str


class MemberProfileResponse(BaseModel):
    """Response schema for the GET /me endpoint."""

    id: UUID
    full_name: str
    email: str
    role: MemberRole
    team_id: Optional[UUID] = None
    team_slug: Optional[str] = None
    organization_id: UUID


# ── Members CRUD Models ─────────────────────────────────────────────


class MemberInviteRequest(BaseModel):
    """Request body for POST /members/invite."""

    full_name: str
    email: EmailStr
    team_id: Optional[UUID] = None
    role: MemberRole


class UpdateMemberRoleRequest(BaseModel):
    """Request body for PATCH /members/{member_id}/role."""

    new_role: MemberRole


class MemberInviteResponse(BaseModel):
    """Response body for a successfully invited member."""

    id: UUID
    full_name: str
    email: str
    role: MemberRole
    team_id: Optional[UUID] = None
    organization_id: UUID
    onboarding_status: str  # Always "pending" on invite (auth_user_id is NULL)


class MemberListItem(BaseModel):
    """
    Single member row in the GET /members response.

    Includes a computed ``onboarding_status``:
    - ``"pending"`` — auth_user_id IS NULL (invited but not yet signed up)
    - ``"active"``  — auth_user_id IS NOT NULL and deleted_at IS NULL
    """

    id: UUID
    organization_id: UUID
    team_id: Optional[UUID] = None
    role: MemberRole
    full_name: str
    email: str
    is_active_for_booking: bool
    onboarding_status: str


class DeleteMemberResponse(BaseModel):
    """Response body for DELETE /members/{member_id}."""

    detail: str
    member_id: UUID
