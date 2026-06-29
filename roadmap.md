# Meeting SaaS — Development Roadmap

> **Living document** — update this file every time a feature is implemented, modified, or planned.
> If you're new to this project, read this top-to-bottom. You'll understand everything.
> Last updated: **2025-06-25**

---

## 1. What Is This Project?

A **multi-tenant booking system** where organizations can manage teams and members, and members can be booked for meetings/appointments.

- **Multi-tenant** means multiple organizations share the same database, but each can only see their own data.
- **Booking** means external or internal users can schedule time with members of an organization.

---

## 2. System Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│      React Frontend      │        │    Supabase Cloud         │
│  (Supabase JS Client)    │        │  ┌──────────────────┐    │
│                          │──JWT──▶│  │  Supabase Auth   │    │
│  • User signs up/logs in │        │  │  (manages users)  │    │
│  • Gets JWT from Supabase│        │  └──────────────────┘    │
│  • Sends JWT to FastAPI  │        │  ┌──────────────────┐    │
│    with every API call   │        │  │  Postgres DB     │    │
└──────────┬───────────────┘        │  │  (our tables)    │    │
           │                        │  └────────▲─────────┘    │
           │ Authorization:         │           │              │
           │ Bearer <JWT>           └───────────┼──────────────┘
           ▼                                    │
┌──────────────────────────┐                    │
│     FastAPI Backend      │     supabase-py    │
│                          │  (service_role key)│
│  1. Verify JWT (HS256)   │────────────────────┘
│  2. Look up member in DB │
│  3. Enforce role access  │
│  4. Handle business logic│
└──────────────────────────┘
```

### How Auth Works (Step by Step)

1. **User opens the React app** and signs in via Supabase Auth (email/password, Google, etc.)
2. **Supabase Auth returns a JWT** — a signed token containing the user's `auth.users.id` in the `sub` claim
3. **React stores this JWT** and sends it as `Authorization: Bearer <token>` on every API call to FastAPI
4. **FastAPI receives the request** and the auth dependency kicks in:
   - `jwt.py` → Verifies the JWT signature using `SUPABASE_JWT_SECRET` (HS256 algorithm). Checks that `sub` and `exp` claims exist. If the token is expired or tampered → **401 Unauthorized**
   - `member_lookup.py` → Queries the `members` table: "Is there an active member row with `auth_user_id` = the `sub` from the JWT?" If no match → **403 Forbidden** (user is authenticated in Supabase but not yet a member of any organization)
   - If both pass → returns a `Member` object with `id`, `organization_id`, `team_id`, `role`
5. **Route handler runs** with the resolved `Member`, knowing exactly who is calling and what role they have

### Why This Design?

- **FastAPI never handles passwords** — Supabase Auth does that. FastAPI only verifies the proof (JWT).
- **Service role key bypasses RLS** — We don't rely on Supabase RLS for backend security. FastAPI's dependency injection layer enforces who can do what.
- **`auth_user_id` is the bridge** — It links a Supabase Auth user (who can log in) to a `members` row (who has a role in an organization). An admin creates the member row first, then when the user signs up and gets linked, they can access the system.

---

## 3. Tech Stack

| Layer            | Technology                 | Why                                           |
|------------------|----------------------------|-----------------------------------------------|
| Frontend         | React + Supabase JS Client | Handles UI + login/signup via Supabase Auth    |
| Backend API      | FastAPI (Python 3.9+)      | Fast, async, excellent dependency injection    |
| Database         | Supabase Postgres          | Managed Postgres with built-in Auth            |
| DB Client        | supabase-py (service_role) | Official Python SDK, bypasses RLS              |
| JWT Verification | PyJWT                      | HS256 token verification                       |
| Config           | Pydantic BaseSettings      | Type-safe env var loading with `.env` support  |
| Server           | Uvicorn                    | ASGI server for FastAPI                        |

---

## 4. Database Tables

| Table           | Status      | Purpose                                  |
|-----------------|-------------|------------------------------------------|
| `members`       | ✅ Exists    | People who belong to an organization      |
| `organizations` | ✅ Exists    | Companies/businesses using the platform   |
| `teams`         | ✅ Exists    | Groups within an organization             |
| `bookings`      | ✅ Exists    | Scheduled meetings/appointments           |

### `members` Table Schema

| Column                 | Type          | Nullable | Notes                                    |
|------------------------|---------------|----------|------------------------------------------|
| `id`                   | UUID (PK)     | No       | Auto-generated primary key                |
| `organization_id`      | UUID (FK)     | No       | Which organization this member belongs to |
| `team_id`              | UUID (FK)     | Yes      | Which team (null for super_admins)        |
| `role`                 | text          | No       | `super_admin` / `team_admin` / `member`   |
| `auth_user_id`         | UUID (FK)     | Yes      | Link to `auth.users.id` — null until user signs up and is linked |
| `full_name`            | text          | No       | Display name                              |
| `email`                | text          | No       | Contact email                             |
| `is_active_for_booking`| boolean       | No       | Can this member be booked?                |
| `deleted_at`           | timestamptz   | Yes      | Soft delete — NULL means active, timestamp means deleted |

#### Key Relationships:
- `members.organization_id` → `organizations.id`
- `members.team_id` → `teams.id`
- `members.auth_user_id` → `auth.users.id` (Supabase Auth)

#### Important Behavior:
- A member can exist **before** they have a Supabase Auth account (`auth_user_id = NULL`). An admin pre-creates the member row, and the user signs up later.
- **Soft deletes**: We never hard-delete members. We set `deleted_at` to the current timestamp. All queries filter with `deleted_at IS NULL`.

---

## 5. Project Structure

```
meeting saas/
├── .env                        # Real credentials (git-ignored!)
├── .env.example                # Template showing required env vars
├── requirements.txt            # Python package dependencies
├── roadmap.md                  # ← You are here
├── venv/                       # Python virtual environment
└── app/
    ├── __init__.py
    ├── main.py                 # FastAPI app — creates the app, mounts routers
    ├── config.py               # Pydantic BaseSettings — loads env vars
    │
    ├── auth/                   # Auth logic (two separate concerns)
    │   ├── jwt.py              # ONLY does JWT verification → returns auth_user_id
    │   └── member_lookup.py    # ONLY does DB query → returns Member
    │
    ├── dependencies/           # FastAPI dependency injection
    │   └── auth.py             # get_current_member (composes jwt + lookup)
    │                           # require_role() factory (wraps get_current_member)
    │
    ├── models/                 # Pydantic models (data shapes)
    │   └── member.py           # Member, MemberRole enum, MemberProfileResponse
    │
    ├── routes/                 # API endpoint definitions
    │   └── me.py               # GET /me
    │
    └── services/               # External service clients
        └── supabase.py         # Supabase client singleton (service_role key)
```

### How Files Connect:

```
Request with Bearer token
    │
    ▼
dependencies/auth.py  ← get_current_member()
    │
    ├──▶ auth/jwt.py  ← verify_supabase_jwt(token, secret) → auth_user_id
    │
    ├──▶ services/supabase.py  ← get_supabase_client() → Client
    │
    ├──▶ auth/member_lookup.py ← lookup_member_by_auth_user_id(client, id) → Member
    │
    ▼
routes/me.py  ← receives Member object, returns profile JSON
```

---

## 6. Role-Based Access Control (RBAC)

### Roles

| Role           | Scope          | Typical Permissions                          |
|----------------|----------------|----------------------------------------------|
| `super_admin`  | Organization   | Full access — manage teams, members, settings |
| `team_admin`   | Team           | Manage their team's members and bookings      |
| `member`       | Self           | View own profile, manage own availability     |

### How It's Enforced

**`get_current_member`** — Use when any authenticated member can access:
```python
@router.get("/my-bookings")
async def list_my_bookings(member: Member = Depends(get_current_member)):
    # Any authenticated member can see their own bookings
    ...
```

**`require_role("super_admin")`** — Use when only specific roles can access:
```python
@router.delete("/members/{member_id}")
async def delete_member(member: Member = Depends(require_role("super_admin"))):
    # Only super_admins can delete members
    ...
```

**`require_role("super_admin", "team_admin")`** — Multiple roles:
```python
@router.put("/teams/{team_id}")
async def update_team(
    member: Member = Depends(require_role("super_admin", "team_admin")),
):
    # Both super_admins and team_admins can update teams
    ...
```

> **Safety feature**: If you pass an invalid role string like `require_role("admin")`, the app crashes at startup with a clear error — not silently at request time.

---

## 7. Error Handling Reference

Every error the auth layer can return:

| Scenario                                  | HTTP Status | Error Message                                                   | Where It's Raised         |
|-------------------------------------------|-------------|----------------------------------------------------------------|---------------------------|
| No `Authorization` header sent            | **403**     | `"Not authenticated"`                                           | FastAPI's `HTTPBearer`    |
| Token format wrong (not a JWT)            | **401**     | `"Invalid authentication token."`                               | `auth/jwt.py`             |
| JWT signature doesn't match secret        | **401**     | `"Invalid authentication token."`                               | `auth/jwt.py`             |
| JWT is expired (`exp` in the past)        | **401**     | `"Token has expired."`                                          | `auth/jwt.py`             |
| JWT missing `sub` or `exp` claims         | **401**     | `"Invalid authentication token."`                               | `auth/jwt.py`             |
| Valid JWT but `sub` is empty              | **403**     | `"Token does not contain a valid user identity."`               | `auth/member_lookup.py`   |
| Valid JWT but no member row matches       | **403**     | `"No linked member account found. Contact your org admin..."`   | `auth/member_lookup.py`   |
| Valid JWT + member found, but wrong role  | **403**     | `"This action requires one of the following roles: ..."`        | `dependencies/auth.py`    |

---

## 8. API Endpoints

| Method | Path      | Auth Required | Roles Allowed  | Status  | Description             |
|--------|-----------|---------------|----------------|---------|-------------------------|
| GET    | `/me`     | ✅ Bearer      | Any member     | ✅ Done  | Current member profile  |
| GET    | `/health` | ❌             | —              | ✅ Done  | Liveness probe          |
| GET    | `/docs`   | ❌             | —              | ✅ Auto  | Swagger UI (FastAPI)    |

### `GET /me` — Response Shape

```json
{
  "id": "uuid-of-the-member",
  "full_name": "Anurag",
  "email": "anurag@example.com",
  "role": "super_admin",
  "team_id": null,
  "organization_id": "uuid-of-the-org"
}
```

---

## 9. Environment Variables

| Variable              | Required | Where to Find                          | Used By               |
|-----------------------|----------|----------------------------------------|-----------------------|
| `SUPABASE_URL`        | ✅        | Supabase Dashboard → Settings → API    | `services/supabase.py`|
| `SUPABASE_KEY`        | ✅        | Same page → `service_role` key (secret) | `services/supabase.py`|
| `SUPABASE_JWT_SECRET` | ✅        | Same page → JWT Settings → JWT Secret   | `auth/jwt.py`         |

> ⚠️ **Never commit `.env` to git.** Only `.env.example` (with placeholder values) should be in version control.

---

## 10. How to Run

```bash
# 1. Clone and enter the project
cd "meeting saas"

# 2. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment
cp .env.example .env
# Edit .env with your real Supabase credentials

# 5. Start the server
uvicorn app.main:app --reload

# Server runs at http://127.0.0.1:8000
# Swagger docs at http://127.0.0.1:8000/docs
```

---

## 11. Implementation Log

### ✅ Phase 1 — Authentication Layer (2025-06-25)

**Goal**: Implement FastAPI auth that verifies Supabase-issued JWTs and resolves the calling member from the database.

**What was built**:

| File                        | What It Does                                              |
|-----------------------------|-----------------------------------------------------------|
| `app/config.py`             | Loads env vars via Pydantic BaseSettings with `.env` file |
| `app/services/supabase.py`  | Creates a cached Supabase client using service_role key   |
| `app/models/member.py`      | `Member` model, `MemberRole` enum, response schema        |
| `app/auth/jwt.py`           | Verifies JWT (HS256), extracts `sub` as `auth_user_id`    |
| `app/auth/member_lookup.py` | Queries `members` table by `auth_user_id`, filters soft-deletes |
| `app/dependencies/auth.py`  | `get_current_member` dependency, `require_role()` factory |
| `app/routes/me.py`          | `GET /me` endpoint returning member profile               |
| `app/main.py`               | FastAPI app creation, router mounting, `/health` endpoint |

**Design decisions made**:

1. **Service role key for backend** — RLS exists but is not relied upon for backend security. FastAPI enforces all access control.
2. **JWT and DB lookup are separate functions** — `jwt.py` knows nothing about the database. `member_lookup.py` knows nothing about JWTs. They're composed together in `get_current_member`. This makes each independently testable.
3. **`require_role` validates at import time** — Passing a typo like `"admn"` fails immediately at startup, not at request time when a user hits the endpoint.
4. **Soft deletes** — All member queries filter `deleted_at IS NULL`. We never hard-delete.
5. **`.limit(1)` instead of `.single()`** — More compatible across supabase-py versions.

**Test results** (2025-06-25):

| Test Case                          | Expected    | Actual      | ✅ |
|------------------------------------|-------------|-------------|---|
| `GET /health`                      | `200 OK`    | `200 OK`    | ✅ |
| `GET /me` — no token               | `403`       | `403`       | ✅ |
| `GET /me` — fake token             | `401`       | `401`       | ✅ |
| `GET /me` — valid JWT, no member   | `403`       | `403`       | ✅ |
| Supabase connection                | Connected   | Connected   | ✅ |
| Members table schema match         | All 9 cols  | All 9 cols  | ✅ |

---

## 12. Upcoming / Planned

> Add planned phases here as the project evolves.

### 🔲 Phase 2 — TBD
### 🔲 Phase 3 — TBD

---

### ✅ Phase 8.1 — Bug Fixes & Stabilization
**Completed**:
- **Frontend Crash**: Fixed missing `Toaster` import in `App.jsx` which caused the root path to render a blank white screen.
- **Reschedule Link Crash**: Corrected a mismatched property reference (`booking.start_time_utc` -> `booking.start_time`) in `ManageBookingPage.jsx` which was causing `parseISO` to crash with `undefined` on the `/manage/:token` route when users clicked links in their emails.

---

### ✅ Phase 8.2 — Notification Throttling & Premium Email Layout (2026-06-26)

**Goal**: Elevate all transactional emails to industry standards and fix severe alert spam regarding calendar disconnections.

**What was built**:
- **Notification Throttling Engine**: Modified `app/services/notifications.py` to intercept `calendar_not_connected_member` and `calendar_not_connected_admin` triggers. The backend now executes a 24-hour lookback query against the `notifications` table ledger and silently drops duplicate alerts for the same member, restoring industry-standard alerting cadence.
- **Jinja2 Template Inheritance**: Created a premium `base.html` layout utilizing HTML tables for cross-client compatibility. The template includes a `#f9fafb` backdrop, centered white card, clean typography, and standardized footers.
- **Transactional UX Upgrade**: Rewrote all 9 existing plain-text HTML templates to `{% extends "base.html" %}`. All transactional links ("Join Google Meet", "Reschedule") were upgraded into prominent indigo and green CTA buttons.
