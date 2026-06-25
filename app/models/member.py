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
    organization_id: UUID
