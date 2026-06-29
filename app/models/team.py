from typing import Optional
from uuid import UUID
from pydantic import BaseModel

class TeamCreateRequest(BaseModel):
    name: str
    slug: str

class TeamUpdateRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    deleted: Optional[bool] = None

class TeamResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    slug: str
    created_at: str
    updated_at: str
    deleted_at: Optional[str] = None
