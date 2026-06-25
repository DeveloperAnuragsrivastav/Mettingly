"""
Meeting SaaS — FastAPI Application Entry Point.
"""

from fastapi import FastAPI

from app.routes.me import router as me_router

app = FastAPI(
    title="Meeting SaaS API",
    description="Multi-tenant booking system backend",
    version="0.1.0",
)

# ── Routes ──────────────────────────────────────────────────────────
app.include_router(me_router)


# ── Health Check ────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """Basic liveness probe — returns 200 if the server is running."""
    return {"status": "ok"}
