"""
Platform Administration Endpoints.

These endpoints are strictly protected by `get_current_platform_admin` and are used
for onboarding new organizations and managing top-level platform entities.
"""

from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError

from app.auth.platform_auth import get_current_platform_admin
from app.models.platform import (
    BootstrapSuperAdminRequest,
    BootstrapSuperAdminResponse,
    OrganizationCreateRequest,
    OrganizationCreateResponse,
    PlatformAdmin,
)
from app.services.audit import write_audit_log
from app.services.supabase import get_supabase_client
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/platform", tags=["Platform"])


@router.get("/me", response_model=PlatformAdmin)
async def get_me(
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> PlatformAdmin:
    """
    Returns the currently authenticated platform admin's profile.
    """
    return admin


@router.post(
    "/organizations",
    response_model=OrganizationCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_organization(
    req: OrganizationCreateRequest,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> Dict[str, Any]:
    """
    Create a new organization and initialize its default availability.
    """
    supabase = get_supabase_client()

    # Step 1: Check slug uniqueness globally
    try:
        existing = (
            supabase.table("organizations")
            .select("id")
            .eq("slug", req.slug)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Organization slug '{req.slug}' is already in use.",
            )
    except APIError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error checking slug uniqueness.",
        ) from e

    # Step 2: Insert the organization
    try:
        org_res = (
            supabase.table("organizations")
            .insert({"name": req.name, "slug": req.slug})
            .execute()
        )
    except APIError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating organization.",
        ) from e

    org_data = org_res.data[0]
    org_id = UUID(org_data["id"])

    # Step 3: Insert default availability configurations (Section 7 specs)
    default_schedule = {
        "monday": [{"start": "09:30", "end": "13:30"}, {"start": "14:15", "end": "16:45"}, {"start": "17:00", "end": "19:00"}],
        "tuesday": [{"start": "09:30", "end": "13:30"}, {"start": "14:15", "end": "16:45"}, {"start": "17:00", "end": "19:00"}],
        "wednesday": [{"start": "09:30", "end": "13:30"}, {"start": "14:15", "end": "16:45"}, {"start": "17:00", "end": "19:00"}],
        "thursday": [{"start": "09:30", "end": "13:30"}, {"start": "14:15", "end": "16:45"}, {"start": "17:00", "end": "19:00"}],
        "friday": [{"start": "09:30", "end": "13:30"}, {"start": "14:15", "end": "16:45"}, {"start": "17:00", "end": "19:00"}],
        "saturday": [],
        "sunday": []
    }

    try:
        supabase.table("org_availability_defaults").insert(
            {
                "organization_id": str(org_id),
                "timezone": "Asia/Kolkata",
                "weekly_schedule": default_schedule,
                "buffer_minutes": 0,
                "min_notice_minutes": 60,
                "max_booking_window_days": 30,
            }
        ).execute()
    except APIError as e:
        # We don't rollback org in REST, but we should log it
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Organization created, but failed to set default availability.",
        ) from e

    # Step 4: Audit Log
    write_audit_log(
        organization_id=org_id,
        actor_member_id=None,  # Not a member
        actor_type="platform_admin",
        action="organization_created",
        entity_type="organization",
        entity_id=str(org_id),
        after_state=org_data,
        metadata={"platform_admin_id": str(admin.id)},
    )

    return org_data


@router.post(
    "/organizations/{org_id}/bootstrap-super-admin",
    response_model=BootstrapSuperAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
async def bootstrap_super_admin(
    org_id: UUID,
    req: BootstrapSuperAdminRequest,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> Dict[str, Any]:
    """
    Create the first Super Admin member for a new organization.
    """
    supabase = get_supabase_client()

    # Verify Org exists
    org_res = supabase.table("organizations").select("id").eq("id", str(org_id)).execute()
    if not org_res.data:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Insert Member
    try:
        member_res = (
            supabase.table("members")
            .insert(
                {
                    "organization_id": str(org_id),
                    "team_id": None,
                    "email": req.email,
                    "full_name": req.full_name,
                    "role": "super_admin",
                    "auth_user_id": None,  # Will be linked by trigger on signup
                }
            )
            .execute()
        )
    except APIError as e:
        if "members_organization_id_email_key" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A member with this email already exists in this organization.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create super admin.",
        ) from e

    member_data = member_res.data[0]

    # Audit Log
    write_audit_log(
        organization_id=org_id,
        actor_member_id=None,
        actor_type="platform_admin",
        action="super_admin_bootstrapped",
        entity_type="member",
        entity_id=member_data["id"],
        after_state=member_data,
        metadata={"platform_admin_id": str(admin.id)},
    )

    try:
        from app.config import get_settings
        settings = get_settings()
        
        # Generate the link directly so we can log it (bypasses email delivery issues on free tier)
        link_resp = supabase.auth.admin.generate_link({
            "type": "invite",
            "email": req.email,
            "options": {"redirect_to": f"{settings.FRONTEND_URL}/set-password"}
        })
        invite_link = link_resp.properties.action_link
        
        print("\n" + "="*80)
        print(f"🔗🔗🔗 INVITE LINK FOR {req.email} 🔗🔗🔗")
        print(invite_link)
        print("="*80 + "\n")
        logger.info(f"Invite link for {req.email}: {invite_link}")

        # Use native Supabase Admin invite to attempt sending the email
        supabase.auth.admin.invite_user_by_email(
            email=req.email,
            options={"redirect_to": f"{settings.FRONTEND_URL}/set-password"}
        )
    except Exception as e:
        logger.error(f"Failed to send native Supabase invite for {req.email}: {e}")

    return {
        "member_id": UUID(member_data["id"]),
        "email": member_data["email"],
        "full_name": member_data["full_name"],
        "role": member_data["role"],
    }


@router.get("/organizations")
async def list_organizations(
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> List[Dict[str, Any]]:
    """
    List all organizations on the platform.
    """
    supabase = get_supabase_client()
    try:
        res = (
            supabase.table("organizations")
            .select("*")
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data
    except APIError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve organizations.",
        ) from e


@router.patch("/organizations/{org_id}")
async def update_organization(
    org_id: UUID,
    updates: dict,
    admin: PlatformAdmin = Depends(get_current_platform_admin),
) -> Dict[str, Any]:
    """
    Update an organization's basic details (e.g. name, is_active).
    """
    supabase = get_supabase_client()
    
    # Filter allowed fields
    allowed_fields = {"name", "is_active"}
    payload = {k: v for k, v in updates.items() if k in allowed_fields}
    
    if not payload:
        raise HTTPException(status_code=400, detail="No valid fields provided for update.")
        
    try:
        res = (
            supabase.table("organizations")
            .update(payload)
            .eq("id", str(org_id))
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Organization not found")
            
        # Audit Log
        write_audit_log(
            organization_id=org_id,
            actor_member_id=None,
            actor_type="platform_admin",
            action="organization_updated",
            entity_type="organization",
            entity_id=str(org_id),
            after_state=res.data[0],
            metadata={"platform_admin_id": str(admin.id), "updates": payload},
        )
            
        return res.data[0]
    except APIError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update organization.",
        ) from e
