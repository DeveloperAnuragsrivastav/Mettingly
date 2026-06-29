"""
Calendar integration routes.

Endpoints:
    GET /calendar/connect   — Returns the Google OAuth consent URL.
    GET /calendar/callback  — OAuth callback to exchange code for tokens.
    GET /calendar/status    — Returns connection status of the current member.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.auth.calendar_auth import (
    get_google_oauth_consent_url,
    verify_oauth_state,
    exchange_google_oauth_code,
)
import requests
from app.dependencies.auth import get_current_member
from app.models.calendar import CalendarConnectResponse, CalendarStatusResponse
from app.models.member import Member
from app.services.supabase import get_supabase_client
from app.services.vault import encrypt_token
from app.config import get_settings

router = APIRouter(prefix="/calendar", tags=["Calendar"])


@router.get(
    "/connect",
    response_model=CalendarConnectResponse,
    summary="Get Google OAuth consent URL",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def connect_calendar(
    current_member: Member = Depends(get_current_member),
):
    """
    Returns the Google OAuth consent URL for the currently authenticated member.
    The member_id is securely signed and included in the 'state' parameter.
    """
    url = get_google_oauth_consent_url(current_member.id)
    return CalendarConnectResponse(url=url)




@router.get(
    "/callback",
    summary="Google OAuth callback handler",
    responses={
        400: {"description": "Invalid state or code parameter"},
        500: {"description": "Failed to exchange token"},
    },
)
async def calendar_callback(
    code: str = Query(...),
    state: str = Query(...),
    # Optional dependency if we want to ensure the user is still logged in to the same browser session
    # But usually OAuth callbacks might be hit directly, though we enforce it via the signed state.
    # We will trust the signed state for the member_id.
):
    """
    Callback endpoint for Google OAuth.
    Receives 'code' and 'state', verifies the state signature to extract member_id,
    exchanges the code for tokens, encrypts the tokens, and upserts the connection.
    """
    frontend_url = get_settings().FRONTEND_URL
    try:
        member_id = verify_oauth_state(state)
    except ValueError as e:
        return RedirectResponse(
            url=f"{frontend_url}/dashboard/calendar?error=invalid_state",
            status_code=status.HTTP_302_FOUND
        )

    # ── Exchange code for tokens ───────────────────────────
    try:
        token_data = exchange_google_oauth_code(code)
    except Exception as e:
        return RedirectResponse(
            url=f"{frontend_url}/dashboard/calendar?error=token_exchange_failed",
            status_code=status.HTTP_302_FOUND
        )

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)
    
    # Fetch email using access token
    try:
        user_info_resp = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        user_info_resp.raise_for_status()
        email = user_info_resp.json().get("email", "")
    except Exception as e:
        email = ""

    # Calculate expiry
    expiry_dt = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # ── Encrypt tokens ───────────────────────────────────────────────
    enc_access_token = encrypt_token(access_token)
    enc_refresh_token = encrypt_token(refresh_token) if refresh_token else None

    # ── Upsert into calendar_connections ─────────────────────────────
    supabase = get_supabase_client()
    
    # We first check if a connection already exists
    response = (
        supabase.table("calendar_connections")
        .select("id")
        .eq("member_id", str(member_id))
        .execute()
    )
    
    now_iso = datetime.now(timezone.utc).isoformat()
    
    upsert_data = {
        "member_id": str(member_id),
        "provider": "google",
        "google_account_email": email,
        "access_token_encrypted": enc_access_token,
        "token_expiry": expiry_dt.isoformat(),
        "scopes_granted": ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"],
        "is_connected": True,
        "connected_at": now_iso,
        "disconnected_at": None,
        "deleted_at": None,
    }
    
    if enc_refresh_token:
        upsert_data["refresh_token_encrypted"] = enc_refresh_token

    if response.data:
        # Update existing
        connection_id = response.data[0]["id"]
        supabase.table("calendar_connections").update(upsert_data).eq("id", connection_id).execute()
    else:
        # Insert new
        supabase.table("calendar_connections").insert(upsert_data).execute()

    # Redirect to frontend success page
    return RedirectResponse(
        url=f"{frontend_url}/dashboard/calendar?connected=true",
        status_code=status.HTTP_302_FOUND
    )


@router.get(
    "/status",
    response_model=CalendarStatusResponse,
    summary="Get calendar connection status",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def calendar_status(
    current_member: Member = Depends(get_current_member),
):
    """
    Returns whether the current member has connected their calendar.
    """
    supabase = get_supabase_client()
    
    response = (
        supabase.table("calendar_connections")
        .select("is_connected")
        .eq("member_id", str(current_member.id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    
    is_connected = False
    if response.data:
        is_connected = bool(response.data[0].get("is_connected"))
        
    return CalendarStatusResponse(is_connected=is_connected)
