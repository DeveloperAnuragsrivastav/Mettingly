"""
Meeting SaaS — FastAPI Application Entry Point.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes.me import router as me_router
from app.routes.members import router as members_router
from app.routes.calendar import router as calendar_router
from app.routes.admin_insights import router as admin_insights_router
from app.routes.public_booking import router as public_booking_router
from app.routes.manage_booking import router as manage_booking_router
from app.routes.platform import router as platform_router
from app.routes.teams import router as teams_router
from app.routes.availability import router as availability_router
from app.routes.temporary_pages import router as temporary_pages_router
from app.scheduler import start_scheduler, shutdown_scheduler

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Meeting SaaS API",
    description="Multi-tenant booking system backend",
    version="0.1.0",
)

# ── CORS ─────────────────────────────────────────────────────────────
# Origins are fully driven by the CORS_ALLOWED_ORIGINS environment variable.
# For local dev: "http://localhost:5173"
# For staging/prod: "https://app.yourdomain.com"
# Multiple origins: "http://localhost:5173,https://app.yourdomain.com"
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    start_scheduler()
    settings = get_settings()
    if not settings.SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY is missing! Email notifications will silently fail.")


@app.on_event("shutdown")
def shutdown_event():
    shutdown_scheduler()



# ── Routes ──────────────────────────────────────────────────────────
app.include_router(me_router)
app.include_router(members_router)
app.include_router(calendar_router)
app.include_router(admin_insights_router)
app.include_router(public_booking_router)
app.include_router(manage_booking_router)
app.include_router(platform_router)
app.include_router(teams_router)
app.include_router(availability_router)
app.include_router(temporary_pages_router)


# ── Health Check ────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """Basic liveness probe — returns 200 if the server is running."""
    return {"status": "ok"}


# ── Frontend SPA Serving ─────────────────────────────────────────────
# This MUST be the last route defined so it acts as a catch-all for anything
# that isn't a defined API route.
import os
from fastapi.responses import FileResponse

FRONTEND_DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    """
    Serves the React SPA.
    If the requested path points to a real file in frontend/dist (like assets/xyz.js), serve it.
    Otherwise, fall back to serving index.html so React Router can handle the URL.
    """
    file_path = os.path.join(FRONTEND_DIST_DIR, full_path)
    
    # If the exact file exists, serve it (e.g. /vite.svg, /assets/index.js)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
        
    # Otherwise, fallback to index.html
    index_path = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
        
    # If frontend/dist doesn't exist at all (e.g. forgot to run npm run build)
    return {"error": "Frontend build not found. Please run 'npm run build' in the frontend directory."}
