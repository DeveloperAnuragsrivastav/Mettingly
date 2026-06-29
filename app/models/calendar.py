"""
Calendar models.
"""

from pydantic import BaseModel


class CalendarConnectResponse(BaseModel):
    """Response containing the Google OAuth consent URL."""
    url: str


class CalendarStatusResponse(BaseModel):
    """Status of the current member's calendar connection."""
    is_connected: bool
    provider: str = "google"
