from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PlatformAdmin(BaseModel):
    id: UUID
    auth_user_id: Optional[UUID]
    email: str
    full_name: Optional[str]
    is_active: bool
    deleted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class OrganizationCreateRequest(BaseModel):
    name: str
    slug: str


class OrganizationCreateResponse(BaseModel):
    id: UUID
    name: str
    slug: str


class BootstrapSuperAdminRequest(BaseModel):
    email: str
    full_name: str


class BootstrapSuperAdminResponse(BaseModel):
    member_id: UUID
    email: str
    full_name: str
    role: str
