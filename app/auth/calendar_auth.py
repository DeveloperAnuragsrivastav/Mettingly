"""
Calendar OAuth connect module.

Abstracts Google Calendar API authentication and credential management.
Other modules (Availability, Booking) will use `get_authenticated_calendar_client`
without knowing implementation details.
"""

import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Any, Dict
from uuid import UUID

import jwt
import requests
from fastapi import HTTPException, status

from app.config import get_settings
from app.services.notifications import notify_calendar_not_connected
from app.services.supabase import get_supabase_client
from app.services.vault import decrypt_token


class CalendarNotConnectedError(Exception):
    """Raised when a member has no connected calendar or refresh fails."""
    pass


def _create_oauth_state(member_id: UUID) -> str:
    """Create a signed JWT state token containing the member_id."""
    settings = get_settings()
    payload = {"member_id": str(member_id)}
    # Use SUPABASE_JWT_SECRET to sign our state parameter to prevent tampering.
    return jwt.encode(payload, settings.SUPABASE_JWT_SECRET, algorithm="HS256")


def verify_oauth_state(state: str) -> UUID:
    """
    Verify the signed JWT state token and extract the member_id.
    Raises ValueError if invalid or tampered with.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            state,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"]
        )
        return UUID(payload["member_id"])
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise ValueError("Invalid or corrupted state parameter") from exc


def get_google_oauth_consent_url(member_id: UUID) -> str:
    """
    Build the Google OAuth2 authorization URL.
    
    Scopes: calendar (read/write), calendar.events
    """
    settings = get_settings()
    state = _create_oauth_state(member_id)
    
    # Standard Google OAuth parameters
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events email",
        "access_type": "offline",
        "prompt": "consent", # Force consent to ensure we get a refresh token
        "state": state,
    }
    
    return f"{base_url}?{urllib.parse.urlencode(params)}"


def exchange_google_oauth_code(code: str) -> Dict[str, Any]:
    """
    Exchange the authorization code for access and refresh tokens.
    """
    settings = get_settings()
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
    }
    resp = requests.post(token_url, data=data)
    if not resp.ok:
        raise CalendarNotConnectedError(f"Failed to exchange code: {resp.text}")
    return resp.json()

def _refresh_google_access_token(refresh_token: str) -> Dict[str, Any]:
    """
    Refresh the Google access token.
    Returns a dict with 'access_token' and 'expires_in'.
    """
    settings = get_settings()
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    resp = requests.post(token_url, data=data)
    if not resp.ok:
        raise CalendarNotConnectedError(f"Failed to refresh token: {resp.text}")
    return resp.json()


def is_member_eligible_for_booking(member_id: UUID) -> bool:
    """
    Returns True only if BOTH:
      - members.is_active_for_booking = TRUE
      - calendar_connections.is_connected = TRUE
      
    This is the single function the Booking/Availability Engine round-robin logic
    must call to build its eligible-members pool.
    """
    supabase = get_supabase_client()
    
    # Check member active status
    member_resp = (
        supabase.table("members")
        .select("is_active_for_booking")
        .eq("id", str(member_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not member_resp.data or not member_resp.data[0].get("is_active_for_booking"):
        return False
        
    # Check calendar connection status
    calendar_resp = (
        supabase.table("calendar_connections")
        .select("is_connected")
        .eq("member_id", str(member_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not calendar_resp.data or not calendar_resp.data[0].get("is_connected"):
        return False
        
    return True


def get_authenticated_calendar_client(member_id: UUID) -> Any:
    """
    ABSTRACTED interface for other modules to get calendar access.
    
    Looks up calendar_connections. If expired, refreshes using refresh_token.
    Raises CalendarNotConnectedError if not connected or refresh fails.
    """
    supabase = get_supabase_client()
    
    response = (
        supabase.table("calendar_connections")
        .select("*")
        .eq("member_id", str(member_id))
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    
    if not response.data:
        notify_calendar_not_connected(member_id)
        raise CalendarNotConnectedError(f"Member {member_id} has no calendar connection.")
        
    connection = response.data[0]
    
    if not connection.get("is_connected"):
        notify_calendar_not_connected(member_id)
        raise CalendarNotConnectedError(f"Member {member_id} calendar connection is disabled.")
        
    # Check if token is expired
    token_expiry = connection.get("token_expiry")
    if not token_expiry:
        notify_calendar_not_connected(member_id)
        raise CalendarNotConnectedError("Missing token_expiry in connection.")
        
    # Naive ISO parsing, python 3.11+ supports datetime.fromisoformat natively with Z
    # We'll just do a basic check.
    try:
        expiry_dt = datetime.fromisoformat(token_expiry.replace("Z", "+00:00"))
        is_expired = datetime.now(timezone.utc) >= expiry_dt
    except ValueError:
        # Fallback if isoformat fails
        is_expired = True

    access_token_enc = connection.get("access_token_encrypted")
    refresh_token_enc = connection.get("refresh_token_encrypted")
    
    if not access_token_enc:
        notify_calendar_not_connected(member_id)
        raise CalendarNotConnectedError("Missing access token.")
        
    access_token = decrypt_token(access_token_enc)
    
    if is_expired:
        if not refresh_token_enc:
            notify_calendar_not_connected(member_id)
            raise CalendarNotConnectedError("Token expired and no refresh token available.")
            
        refresh_token = decrypt_token(refresh_token_enc)
        
        try:
            new_tokens = _refresh_google_access_token(refresh_token)
            access_token = new_tokens["access_token"]
            expires_in = new_tokens.get("expires_in", 3599)
            new_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            
            # Encrypt and update DB
            from app.services.vault import encrypt_token
            new_enc_access = encrypt_token(access_token)
            
            supabase.table("calendar_connections").update({
                "access_token_encrypted": new_enc_access,
                "token_expiry": new_expiry.isoformat()
            }).eq("id", connection["id"]).execute()
            
        except Exception as exc:
            notify_calendar_not_connected(member_id)
            raise CalendarNotConnectedError("Failed to refresh calendar token.") from exc
            
    # Return a mocked/stubbed credentials object that other modules would use.
    # E.g., google.oauth2.credentials.Credentials
    class MockCredentials:
        def __init__(self, token):
            self.token = token
            
    return MockCredentials(token=access_token)
