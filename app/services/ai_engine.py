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


def generate_insight(insight_type: str, booking_id: UUID, regenerate: bool = False, member_notes: str = None) -> Dict[str, Any]:
    """
    Generates an AI insight for a booking.
    Supported types: 'booking_summary', 'meeting_prep', 'followup_draft', 'meeting_notes'.
    Idempotent — returns existing generated content immediately unless regenerate=True.
    """
    if insight_type not in ("booking_summary", "meeting_prep", "followup_draft", "meeting_notes"):
        raise ValueError(f"Invalid insight type: {insight_type}")

    supabase = get_supabase_client()

    # Idempotency — return immediately if already generated or pending
    if regenerate:
        supabase.table("ai_insights").delete().eq("booking_id", str(booking_id)).eq("insight_type", insight_type).execute()
        if insight_type == "meeting_notes":
            supabase.table("meeting_action_items").delete().eq("booking_id", str(booking_id)).eq("is_done", False).execute()
    else:
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

        elif insight_type == "meeting_prep":
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

        elif insight_type == "followup_draft":
            if not member_notes:
                raise ValueError("member_notes are required for followup_draft")
                
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
            
            prompt = f"""You are an AI assistant for {org_name}, drafting a post-meeting follow-up email on behalf of {team_name}.
Meeting was with: {booking.get('caller_name', 'the client')} ({booking.get('caller_email', 'unknown')})

Context:
- Booking summary: {summary_tldr}
- Reason for meeting: {reason}
- Member's Post-Meeting Notes: {member_notes}

Write a professional, polite, and concise follow-up email draft based strictly on the member's notes. Do not invent commitments not mentioned in the notes.

Output ONLY valid JSON in this exact shape:
{{
  "subject": "<suggested email subject>",
  "body": "<draft email body text>"
}}"""

        else:  # meeting_notes
            if not member_notes:
                raise ValueError("member_notes are required for meeting_notes")
                
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
            
            prompt = f"""You are an AI assistant for {org_name}.
Meeting was with: {booking.get('caller_name', 'the client')} ({booking.get('caller_email', 'unknown')})

Context:
- Booking summary TL;DR: {summary_tldr}
- Reason for meeting: {reason}
- Member's Post-Meeting Notes: {member_notes}

Extract key points, decisions, and action items strictly from the member's notes. Do not invent details not mentioned in the notes.

Output ONLY valid JSON in this exact shape:
{{
  "key_points": ["<point 1>", "<point 2>"],
  "decisions": ["<decision 1>", "<decision 2>"],
  "action_items": ["<action item 1>", "<action item 2>"]
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
        elif insight_type == "meeting_prep":
            if not {"caller_context", "talking_points", "is_repeat_caller"}.issubset(content.keys()):
                raise LLMProviderError(f"Missing keys in meeting_prep response: {content}")
            if not isinstance(content.get("talking_points"), list):
                raise LLMProviderError("talking_points must be a list")
        elif insight_type == "followup_draft":
            if not {"subject", "body"}.issubset(content.keys()):
                raise LLMProviderError(f"Missing keys in followup_draft response: {content}")
        else:  # meeting_notes
            if not {"key_points", "decisions", "action_items"}.issubset(content.keys()):
                raise LLMProviderError(f"Missing keys in meeting_notes response: {content}")
            
            # Pop action_items out so they are not stored in ai_insights
            action_items = content.pop("action_items", [])

        # Mark as generated
        supabase.table("ai_insights").update({
            "status": "generated",
            "content": content
        }).eq("booking_id", str(booking_id)).eq("insight_type", insight_type).execute()

        # Separately insert action items
        if insight_type == "meeting_notes" and action_items:
            action_rows = []
            for item in action_items:
                action_rows.append({
                    "booking_id": str(booking_id),
                    "organization_id": str(org_id),
                    "description": item,
                    "is_done": False
                })
            if action_rows:
                supabase.table("meeting_action_items").insert(action_rows).execute()

        # Put action_items back into the return payload for immediate frontend use
        if insight_type == "meeting_notes":
            content["action_items"] = action_rows

        return content

    except Exception as e:
        logger.error(f"Failed to generate insight {insight_id}: {e}")
        supabase.table("ai_insights").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", insight_id).execute()
        return {}
