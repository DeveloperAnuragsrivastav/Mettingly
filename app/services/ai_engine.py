"""
AI Insights Engine.

Generates AI-powered insights for bookings using the Groq LLM.
Fully generic and tenant-agnostic — no hardcoded org/company logic.
"""
import json
import logging
from typing import Dict, Any
from uuid import UUID
from functools import lru_cache

from app.config import get_settings
from app.services.supabase import get_supabase_client

logger = logging.getLogger(__name__)


class LLMProviderError(Exception):
    pass


@lru_cache
def _get_groq_client():
    """Lazy singleton Groq client — only imported/initialised when first called."""
    from groq import Groq
    settings = get_settings()
    return Groq(api_key=settings.GROQ_API_KEY)


def _call_llm(prompt: str) -> str:
    """
    Calls the Groq LLM (llama-3.3-70b-versatile) with JSON mode.
    Raises LLMProviderError on any failure.
    """
    try:
        client = _get_groq_client()
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        raise LLMProviderError(f"LLM Provider failed: {str(e)}")


def generate_insight(insight_type: str, booking_id: UUID) -> Dict[str, Any]:
    """
    Generates an AI insight for a booking.
    Supported types: 'booking_summary', 'meeting_prep'.
    Idempotent — returns existing generated content immediately.
    """
    if insight_type not in ("booking_summary", "meeting_prep"):
        raise ValueError(f"Invalid insight type: {insight_type}")

    supabase = get_supabase_client()

    # Idempotency — return immediately if already generated or pending
    existing = (
        supabase.table("ai_insights")
        .select("id, status, content")
        .eq("booking_id", str(booking_id))
        .eq("insight_type", insight_type)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        if row["status"] == "generated":
            return row["content"]
        if row["status"] == "pending":
            return {}  # another worker is already running, skip

    # Fetch booking + org + team context
    b_resp = (
        supabase.table("bookings")
        .select("*, organizations(name), teams(name)")
        .eq("id", str(booking_id))
        .execute()
    )
    if not b_resp.data:
        raise ValueError(f"Booking {booking_id} not found")

    booking = b_resp.data[0]
    org_id = booking.get("organization_id")
    org_name = (booking.get("organizations") or {}).get("name") or "the organization"
    team_name = (booking.get("teams") or {}).get("name") or "the team"
    responses = booking.get("custom_form_responses") or {}
    reason = responses.get("reason", "No reason provided")
    summary_text = responses.get("summary", "No summary provided")

    # Insert pending record
    insert_resp = supabase.table("ai_insights").insert({
        "organization_id": org_id,
        "booking_id": str(booking_id),
        "insight_type": insight_type,
        "status": "pending",
    }).execute()

    if not insert_resp.data:
        raise RuntimeError("Failed to insert pending ai_insight record")

    insight_id = insert_resp.data[0]["id"]

    try:
        # Build the prompt based on type
        if insight_type == "booking_summary":
            prompt = f"""You are an AI assistant for {org_name}, assisting {team_name}.
A new booking has been created by {booking.get('caller_name', 'a customer')} ({booking.get('caller_email', 'unknown')}).

Reason for meeting: {reason}
Summary details: {summary_text}

Analyze the meeting details and output ONLY valid JSON in this exact shape:
{{
  "priority": "low" | "medium" | "high",
  "tldr": "<one sentence summary>",
  "category": "<short label e.g. Support, Sales, Consultation>"
}}"""

        else:  # meeting_prep
            # Reuse existing booking_summary tldr if available
            summary_resp = (
                supabase.table("ai_insights")
                .select("content")
                .eq("booking_id", str(booking_id))
                .eq("insight_type", "booking_summary")
                .eq("status", "generated")
                .execute()
            )
            summary_tldr = (
                summary_resp.data[0]["content"].get("tldr", "")
                if summary_resp.data else "No summary available"
            )

            # Check for repeat caller
            caller_email = booking.get("caller_email")
            is_repeat = False
            if caller_email:
                prior = (
                    supabase.table("bookings")
                    .select("id")
                    .eq("organization_id", str(org_id))
                    .eq("caller_email", caller_email)
                    .eq("status", "confirmed")
                    .neq("id", str(booking_id))
                    .execute()
                )
                is_repeat = len(prior.data) > 0

            repeat_ctx = (
                "This caller has booked with this organization before."
                if is_repeat else "This is a new caller."
            )

            prompt = f"""You are an AI assistant for {org_name}, preparing {team_name} for an upcoming meeting.
Meeting with: {booking.get('caller_name', 'a customer')} ({booking.get('caller_email', 'unknown')})

Context:
- Booking summary: {summary_tldr}
- Reason: {reason}
- Details: {summary_text}
- Caller history: {repeat_ctx}

Output ONLY valid JSON in this exact shape:
{{
  "caller_context": "<1-2 sentences about who is calling and their objective>",
  "talking_points": ["<point 1>", "<point 2>", "<point 3>"],
  "is_repeat_caller": {"true" if is_repeat else "false"}
}}"""

        # Call LLM
        raw = _call_llm(prompt)

        # Parse
        try:
            content = json.loads(raw)
        except json.JSONDecodeError:
            raise LLMProviderError(f"Failed to parse LLM JSON: {raw}")

        # Validate shape
        if insight_type == "booking_summary":
            if not {"priority", "tldr", "category"}.issubset(content.keys()):
                raise LLMProviderError(f"Missing keys in booking_summary response: {content}")
            if content.get("priority") not in ("low", "medium", "high"):
                raise LLMProviderError(f"Invalid priority: {content.get('priority')}")
        else:
            if not {"caller_context", "talking_points", "is_repeat_caller"}.issubset(content.keys()):
                raise LLMProviderError(f"Missing keys in meeting_prep response: {content}")
            if not isinstance(content.get("talking_points"), list):
                raise LLMProviderError("talking_points must be a list")

        # Mark as generated
        supabase.table("ai_insights").update({
            "status": "generated",
            "content": content,
        }).eq("id", insight_id).execute()

        return content

    except Exception as e:
        logger.error(f"Failed to generate insight {insight_id}: {e}")
        supabase.table("ai_insights").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", insight_id).execute()
        return {}
