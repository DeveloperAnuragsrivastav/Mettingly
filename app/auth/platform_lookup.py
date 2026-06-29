"""
Database lookup logic for Platform Admins.
"""

from fastapi import HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.models.platform import PlatformAdmin


def lookup_platform_admin_by_auth_user_id(
    supabase: Client, auth_user_id: str
) -> PlatformAdmin:
    """
    Look up a platform admin by their Supabase Auth ID.

    Raises:
        HTTPException(403): If the admin is not found or is inactive/deleted.
        HTTPException(500): On database errors.
    """
    try:
        response = (
            supabase.table("platform_admins")
            .select("*")
            .eq("auth_user_id", auth_user_id)
            .is_("deleted_at", "null")
            .execute()
        )
    except APIError as e:
        # Mask DB internals, raise 500
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error during platform admin lookup.",
        ) from e

    if not response.data:
        # Valid JWT, but not linked to any active platform admin
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Valid authentication token, but no matching platform admin profile found.",
        )

    admin_data = response.data[0]

    # Check is_active flag (separate from soft delete)
    if not admin_data.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform Admin account is suspended.",
        )

    return PlatformAdmin(**admin_data)
