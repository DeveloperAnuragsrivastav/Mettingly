from datetime import datetime, date
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.dependencies.auth import get_current_member, require_role
from app.models.member import Member, MemberRole
from app.services.supabase import get_supabase_client

router = APIRouter(prefix="/temporary-pages", tags=["Campaigns"])

class TemporaryPageRequest(BaseModel):
    title: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=255)
    duration_minutes: int
    expiry_type: str = Field(..., description="never, specific_date, after_days, or after_bookings")
    expiry_date: Optional[date] = None
    expiry_after_days: Optional[int] = None
    expiry_after_bookings: Optional[int] = None

class TemporaryPageDeactivateRequest(BaseModel):
    deactivation_reason: str = "manual"

@router.post("")
def create_temporary_page(
    req: TemporaryPageRequest,
    member: Member = Depends(require_role(MemberRole.TEAM_ADMIN, MemberRole.SUPER_ADMIN))
):
    """
    Creates a new temporary booking page (campaign).
    """
    supabase = get_supabase_client()
    
    # Validation
    if req.expiry_type not in ["never", "specific_date", "after_days", "after_bookings"]:
        raise HTTPException(status_code=400, detail="Invalid expiry_type")
        
    if req.expiry_type == "specific_date" and not req.expiry_date:
        raise HTTPException(status_code=400, detail="expiry_date is required for specific_date expiry")
    if req.expiry_type == "after_days" and req.expiry_after_days is None:
        raise HTTPException(status_code=400, detail="expiry_after_days is required for after_days expiry")
    if req.expiry_type == "after_bookings" and req.expiry_after_bookings is None:
        raise HTTPException(status_code=400, detail="expiry_after_bookings is required for after_bookings expiry")
        
    # Check if slug exists
    existing = supabase.table("temporary_booking_pages").select("id").eq("slug", req.slug).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Slug is already taken")

    data = {
        "organization_id": str(member.organization_id),
        "created_by_member_id": str(member.id),
        "title": req.title,
        "slug": req.slug,
        "duration_minutes": req.duration_minutes,
        "expiry_type": req.expiry_type,
        "expiry_date": req.expiry_date.isoformat() if req.expiry_date else None,
        "expiry_after_days": req.expiry_after_days,
        "expiry_after_bookings": req.expiry_after_bookings,
        "current_booking_count": 0,
        "is_active": True
    }
    
    resp = supabase.table("temporary_booking_pages").insert(data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create temporary page")
        
    return resp.data[0]


@router.get("")
def list_temporary_pages(
    member: Member = Depends(require_role(MemberRole.TEAM_ADMIN, MemberRole.SUPER_ADMIN))
):
    """
    List all temporary pages for the organization.
    """
    supabase = get_supabase_client()
    
    # Always org-wide per ARCHITECTURE.md Section 9
    resp = (
        supabase.table("temporary_booking_pages")
        .select("*")
        .eq("organization_id", str(member.organization_id))
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )
    
    return {"items": resp.data}


@router.patch("/{page_id}")
def deactivate_temporary_page(
    page_id: UUID,
    req: TemporaryPageDeactivateRequest,
    member: Member = Depends(require_role(MemberRole.TEAM_ADMIN, MemberRole.SUPER_ADMIN))
):
    """
    Manually deactivate a temporary page.
    """
    supabase = get_supabase_client()
    
    # Check exists and org matches
    page = supabase.table("temporary_booking_pages").select("organization_id").eq("id", str(page_id)).execute()
    if not page.data:
        raise HTTPException(status_code=404, detail="Page not found")
        
    if page.data[0]["organization_id"] != str(member.organization_id):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    updates = {
        "is_active": False,
        "deactivation_reason": req.deactivation_reason,
        "deactivated_at": datetime.utcnow().isoformat() + "Z"
    }
    
    resp = supabase.table("temporary_booking_pages").update(updates).eq("id", str(page_id)).execute()
    return resp.data[0]
