# ARCHITECTURE.md — Multi-Team Booking System (Complete, Self-Sufficient Design Reference)

> This file is the single source of truth. It must contain enough detail that anyone (human or AI) reading it can continue building this system WITHOUT needing to ask clarifying questions about scope, behavior, or rationale. If something is ambiguous below, treat the most detailed/specific instruction as authoritative. Do not redesign, do not skip phases, do not silently change behavior described here.

---

## 1. What This System Is

An internal multi-team booking system (a Calendly-style clone) being built for EZ Rankings, a Noida-based digital marketing/SEO agency. It replaces a previous setup (n8n workflow + frontend) that only worked for one team and required manual rebuilding + manual Google OAuth setup for every new team. The new system must let any team (Sales, Support, etc.) get its own booking link with zero code changes — just configuration.

A secondary, explicit long-term goal: the architecture should be solid enough that if this is ever resold as a product to other companies, it would not require a structural rewrite — only extension. This does NOT mean building billing/SaaS infrastructure now (explicitly deferred — see Section 12). It means: multi-tenant-shaped data model, no hardcoded single-company assumptions, abstracted auth, configurable business rules.

This is being built by one developer (the user), in incremental, reviewed phases, using Claude as a collaborative architect/pair-programmer, inside an editor called Antigravity that has NO live database/Supabase connection during code generation — all code must be written to be correct by inspection, not verified by running it against a real DB.

---

## 2. Tech Stack (Locked)

- **Backend**: FastAPI (Python)
- **Frontend**: React (Vite-based SPA) — chosen because the developer is more comfortable with React than Next.js; no SSR/SEO requirement since this is an internal tool, not a public marketing site
- **Database**: Supabase (PostgreSQL)
- **App authentication**: Supabase Auth (built-in) — NOT custom JWT/password handling
- **Backend-to-database**: supabase-py (official Python client) — avoid raw REST calls to Supabase unless there's no other way
- **Calendar/Meet integration**: Google Calendar API + Google Meet auto-link generation, via **per-user OAuth** (see Section 6 — this is a different OAuth system from app login)
- **Deployment target**: company cloud servers / VPS — not yet finalized, open decision, not blocking development

---

## 3. Multi-Tenancy Model

Hierarchy: **Organization → Team → Member**

- Every tenant-scoped table carries `organization_id`. This is the foundation for future resale — if another company ever uses this system, it becomes a second `organizations` row, not a parallel codebase.
- **One member belongs to exactly ONE team.** This was explicitly confirmed — do not design a many-to-many member-team relationship. Use a direct foreign key (`members.team_id`), not a junction table.
- Team `slug` (used in the public booking URL, e.g. `/book/sales`) is unique **per-organization**, not globally — two different organizations could both have a team called "sales" with different slugs resolving correctly per-org.
- Member `email` is unique **per-organization**, not globally — same reasoning, future-proofs against the same email existing under two different client companies.
- Within the current real-world scope (EZ Rankings only), there is exactly one `organizations` row. The multi-tenant shape exists for future-proofing, not because it's needed today.

---

## 4. Roles & Permissions (Exact Behavior)

Three internal roles, plus one fully external "non-role":

### Caller (external person booking a meeting)
- **No login, no account, no signup — ever.**
- Can only: open a public booking link, see available time slots, pick a slot, fill in basic details (name, email) plus any custom questions the team configured, confirm the booking, see a confirmation page.
- Can later use a secure tokenized link (sent via email) to reschedule or cancel — still no login required for this.
- This is intentional and must never be expanded to require caller accounts unless explicitly requested later.

### Member
- Has app login (via Supabase Auth — email/password or Google Sign-in).
- Sees only their OWN bookings and OWN data — no visibility into teammates' bookings or other teams.
- Can set their OWN availability override (recurring weekly schedule different from team/org default) and mark specific dates as unavailable (leave/holiday).
- Must separately connect their Google Calendar (see Section 6) — this is NOT automatic just because they logged into the app. Until they do, they are automatically excluded from round-robin assignment (see Section 7), and both they and their Team Admin get notified about this.

### Team Admin
- Everything a Member can do, for themselves, PLUS:
- Can see their OWN TEAM's data only — bookings, member utilization, cancel rates for their team. Cannot see other teams' data. (This mirrors how Calendly's "Team Manager" role works — scoped to one team, not company-wide.)
- Can toggle any member of their team `is_active_for_booking` ON/OFF — this controls whether that member is included in round-robin assignment at all. Use case: a member goes on leave, admin temporarily toggles them off; round-robin simply skips them, no other change needed.
- Can override their team's default availability (working hours, breaks) away from the org-wide default.
- Can create **Temporary Booking Pages** (see Section 9).
- **CANNOT promote another member to Team Admin.** Only Super Admin can do this (explicit decision — least-privilege principle, single source of truth for role changes, clean audit trail).

### Super Admin
- Sees EVERYTHING — all teams, all members, org-wide insights, the full audit log.
- Can override any team's settings.
- Is the ONLY role that can promote a member to Team Admin.
- Can create Temporary Booking Pages (same as Team Admin).

**Important distinction not to confuse**: "Team Admin can see their team's data" vs "Member can only see their own data" — when implementing dashboards, the data-scoping rule is: Super Admin = no filter, Team Admin = filter by `team_id = their team`, Member = filter by `member_id = themselves`. This applies to bookings views, utilization stats, and any future insight features.

---

## 5. App Authentication (Login/Signup) — Exact Architecture

This was revised mid-project — the CURRENT and FINAL decision is:

- **Supabase Auth handles all login/signup.** The React frontend talks DIRECTLY to Supabase Auth via the Supabase JS client for signup, login, logout, and session management. FastAPI is NEVER involved in password handling, signup flows, or session creation.
- Login methods supported: **Email/Password AND Google Sign-in** (both enabled).
- FastAPI's only job regarding auth: verify the Supabase-issued JWT on every incoming API request (`Authorization: Bearer <token>` header), and resolve that token to a row in the `members` table.
- **How the resolution works**: the JWT's `sub` claim is the Supabase `auth.users.id`. The `members` table has a column `auth_user_id` (nullable UUID, FK to `auth.users(id)`) that links a business-logic "member" identity to a Supabase Auth identity. FastAPI verifies the JWT, extracts `sub`, looks up `members WHERE auth_user_id = <sub> AND deleted_at IS NULL`.
- **Why `auth_user_id` is nullable**: an admin can create a `members` row (inviting someone) BEFORE that person has actually signed up in Supabase Auth. Until they sign up, `auth_user_id` is NULL and they cannot authenticate yet — this represents "invited but not yet onboarded."
- **Auto-linking trigger**: a Postgres trigger (`on_auth_user_created`) fires after a new row is inserted into `auth.users`. It looks for a `members` row with a matching `email` and `auth_user_id IS NULL`, and sets `auth_user_id` to the new auth user's id. This is how "admin invites by email, person signs up later" gets automatically connected without manual linking.
- **Auth columns that do NOT exist on `members`** (deliberately removed, because Supabase Auth replaces this need): `password_hash`, `auth_provider`, `failed_login_attempts`, `locked_until`. Do not re-add these. If SSO/enterprise auth is ever needed beyond what Supabase Auth supports, that is a future decision, not a gap to "fix" by re-adding these columns.
- **Required FastAPI auth components**: `get_current_member` dependency (JWT verify → member lookup → return member dict with id/organization_id/team_id/role; 401 if invalid token, 403 if no linked member found), `require_role(*roles)` dependency factory for endpoint-level role gating, a `GET /me` endpoint for the frontend to fetch the logged-in member's profile/role/team after login (frontend uses this to decide which dashboard view to render).
- **Coding-environment constraint**: since Antigravity has no live Supabase connection, all backend auth code must be written to be logically correct without live testing — supabase-py client must live in its own isolated module so it can be mocked, and config (Supabase URL, JWT secret, keys) must come from environment variables via a settings module, referencing `.env.example` placeholders, never hardcoded or assumed-present.

---

## 6. Google Calendar Connection — Exact Architecture (Separate System From App Login)

This is the single most important distinction in the whole system and must never be conflated with Section 5's app login:

- **App login (Supabase Auth)** answers: "who is this person, can they use the dashboard."
- **Calendar connection (per-user Google OAuth)** answers: "can the system create real Google Calendar events and Meet links on this specific person's calendar." These are independent. Logging in via "Sign in with Google" does NOT automatically grant calendar access — calendar connection is always a deliberate, separate, explicit step.

### Why per-user OAuth instead of domain-wide delegation
Domain-wide delegation (a single Google Workspace service account that can impersonate any user in the company domain) was seriously considered and is technically valid for this exact use case (single company, all employees on one Google Workspace domain) — it would mean zero per-employee consent friction. It was REJECTED for now specifically because it requires Google Workspace Admin Console access to authorize the service account, and the developer is uncertain whether that admin-level approval will be obtainable in a reasonable timeframe at this company. Rather than block the project on an uncertain approval, the team chose to start with per-user OAuth, which the developer can implement independently without needing anyone else's permission.

**This auth method must be built as an abstracted/swappable module.** If domain-wide delegation access becomes available later, the goal is to be able to switch the underlying calendar-auth mechanism without rewriting the booking engine, availability engine, or any other business logic that depends on "give me a working calendar credential for member X." Do not hardcode per-user-OAuth assumptions into business logic layers — only into the calendar-auth module itself.

### How per-user OAuth works structurally
- Each member, after logging into the app, sees a "Connect Google Calendar" button in their dashboard (a separate onboarding step, not bundled with login).
- This triggers a standard Google OAuth2 consent flow scoped to Calendar (and Meet, which rides along with Calendar API access).
- The resulting `access_token` and `refresh_token` are stored ENCRYPTED in a dedicated table `calendar_connections` (1:1 with `members`, enforced via UNIQUE constraint on `member_id`), NOT as columns on `members` itself — this isolation matters because token refresh happens frequently (tokens expire hourly) and isolating these high-frequency writes from the `members` identity row avoids unnecessary lock contention.
- Encryption is via Supabase Vault (`pgsodium`) — token columns must never be stored as readable plaintext, and this must not rely purely on "the application promises to encrypt before insert" as the only safeguard; Vault makes plaintext storage structurally harder to do by accident.
- `calendar_connections` also tracks: which provider (field included now as `provider = 'google'` even though only Google exists today, to avoid a future rename if Outlook is ever added), whether currently connected (`is_connected`), when connected/disconnected, last token refresh attempt and any refresh error (critical for diagnosing why a member got excluded from round-robin).
- **Edge case to handle**: Google does not notify the system when a user manually revokes access from their own Google Account settings — the system only discovers this when a token refresh attempt fails. There will always be a small window where the system believes a member is connected but Google has already revoked access. This is a real limitation, not a bug to "fix" — handle it via the refresh-error tracking and graceful exclusion, not by assuming it can be eliminated.
- **If a member has not connected their calendar** (or their connection has failed/been revoked): they are automatically excluded from round-robin assignment (same mechanism as `is_active_for_booking = FALSE`, but driven by calendar-connection state, not the manual toggle), AND a notification is sent to BOTH the member themselves and their Team Admin, so the admin is aware team capacity is reduced and can follow up.
- **Cost/quota awareness** (informational, not a blocker): Google Calendar API is currently free for standard use; quota is consumed per the OAuth-authorizing entity. Per-user OAuth naturally gives each user their own quota pool (unlike domain-wide delegation, where all impersonated calls share one service account's quota bucket) — this was actually a secondary point in favor of per-user OAuth at this stage.

---

## 7. Availability Engine — Exact Cascading Logic

Availability resolves through a strict cascade, checked in this exact order:

1. **Member-level override** (if the member has set their own recurring weekly schedule) — use this if present.
2. **Team-level override** (if the team has a custom default schedule) — use this if member-level is absent.
3. **Organization-level default** — fallback if neither above is set.
4. **AFTER the above resolves a normal day's hours, check specific-date blocks** (leave/holiday) for that member on that date. If a full-day block exists, the member is unavailable that entire day regardless of what the cascade computed. Partial-day blocks (e.g. "on leave from 2pm onward") are also supported.

This is implemented as nullable "override" columns/rows at each level — a missing row at team or member level does NOT mean "unavailable," it means "inherit from the level above." This must not be confused with `is_active_for_booking = FALSE` (a member toggle, Section 4) or calendar-disconnected exclusion (Section 6) — those are separate "fully excluded" signals, distinct from "this level has no override, inherit upward."

### Org-wide default values (the actual baseline, before any team/member customizes anything)
- **Working days**: Monday to Friday
- **Working hours**: 9:30 AM to 7:00 PM
- **Lunch break**: 1:30 PM to 2:15 PM (45 minutes) — excluded from bookable slots
- **Short break**: 4:45 PM to 5:00 PM — excluded from bookable slots
- These breaks are NOT modeled as a separate "exclusions" concept in the data — they are simply gaps between time-ranges in the day's schedule (e.g. Monday = [09:30–13:30, 14:15–16:45, 17:00–19:00]). The system does not need to "know" something is called lunch vs. a break; it only needs the bookable time ranges.
- Timezone: stored explicitly (IANA timezone names like "Asia/Kolkata", never raw UTC offsets, because offsets break across daylight-saving transitions for future-dated bookings) — can be set/overridden at org, team, or member level independently.

### Additional configurable parameters (cascade the same way as schedule)
- **Buffer time between meetings**: prevents back-to-back zero-gap bookings.
- **Minimum notice period**: e.g. don't allow booking a slot less than X hours/minutes from now.
- **Maximum booking window**: e.g. don't show slots more than X days in the future.
- These three are NOT hardcoded fixed values — they cascade through org → team → member like the schedule itself, since different teams may reasonably want different buffer/notice/window settings (e.g. sales might want a shorter notice window than support).

### Duration
- Caller chooses meeting duration from a Calendly-style PREDEFINED DROPDOWN (e.g. 15/30/45/60 minutes) — NOT free-text/custom duration input. The available slots shown must match whatever duration is selected.

### Timezone handling for the caller
- The booking page must auto-detect the caller's browser timezone and display available slots converted into their local time — the caller should never have to manually figure out timezone conversion.

---

## 8. Booking & Assignment Engine — Exact Behavior

### Assignment logic
- **Round-robin, least-busy-first**, among team members who are currently eligible (i.e., `is_active_for_booking = TRUE` AND calendar successfully connected). "Least-busy-first" means the member with the fewest recent/current bookings gets priority for the next assignment — this is NOT simple round-the-clock rotation ignoring load, it actively considers who has the lightest load.
- For regular team booking links, the eligible pool is that team's members only.
- For Temporary Booking Pages (Section 9), the eligible pool is the ENTIRE ORGANIZATION, not limited to one team — this was an explicit, deliberate difference confirmed during design.

### Booking flow (step by step, exact sequence)
1. Caller opens a team's public link (`/book/{team-slug}`) or a temporary campaign link.
2. Caller selects a duration from the dropdown.
3. System computes available slots (applying the full availability cascade from Section 7, converted to caller's detected timezone, respecting buffer/notice/window settings).
4. Caller picks a slot, fills in name/email and any custom form questions configured for that team/page.
5. Caller confirms.
6. Backend: selects the least-busy eligible member via round-robin → creates a Google Calendar event using that member's stored OAuth credentials → Google auto-generates a Meet link as part of event creation → both the caller and the assigned member are added as event attendees.
7. Confirmation is shown to the caller; both parties receive notifications (Section 10).

### Double-booking prevention (critical, non-negotiable mechanism)
- This must be enforced as a DATABASE-LEVEL constraint (Postgres `EXCLUDE USING gist`, checking for time-range overlap on the same `assigned_member_id` among `status = 'confirmed'` bookings), not merely an application-level check-then-insert pattern. The reasoning: application-level "check availability, then insert" has an inherent race condition window under concurrent requests; a database exclusion constraint makes the overlapping state structurally impossible to insert at all, regardless of how many backend instances are running concurrently.
- This constraint protects against double-booking WITHIN the system's own `bookings` table. It does NOT protect against conflicts with events that exist directly on a member's real Google Calendar outside this system (e.g. a personal meeting they added themselves) — that gap is closed separately by querying Google's FreeBusy API as part of availability computation, BEFORE a booking attempt reaches the database constraint. The DB constraint is the last line of defense against internal races; the FreeBusy check is what catches real-world external conflicts.
- **Idempotency**: bookings carry an `idempotency_key` to handle duplicate submissions caused by network retries or double-clicks on the public booking page — a retried request with the same key must not create a second booking.
- **Calendar sync consistency risk (known, accepted limitation, must be surfaced not hidden)**: creating the DB booking row and creating the actual Google Calendar event are two separate operations that cannot be made atomic together (no distributed transaction across our DB and Google's API). If the DB write succeeds but the Google API call fails, the booking is tracked via a `calendar_sync_status` field (`pending` / `verified` / `unverified_fallback` / `sync_failed`) plus retry-tracking fields, so this failure state is visible and reconcilable rather than silently producing a "confirmed" booking with no real calendar event behind it.

### Reschedule behavior
- Rescheduling does NOT mutate the existing booking row's time fields in place. It creates a NEW booking row, links it back to the original via `rescheduled_from_booking_id`, and marks the original row's `status = 'rescheduled'`. This preserves full history — what was originally booked and what it became — without needing a separate history table just for this transition.

### Cancellation behavior
- Marks the booking `status = 'cancelled'`, records `cancelled_at` and optionally a reason. The corresponding Google Calendar event should also be cancelled/deleted via the API.

### Reschedule/Cancel access (caller-facing, no login)
- Each booking has an associated secure, independently-generated random token (NOT the booking's own database ID/UUID — a separate secret) stored in `booking_tokens`. The caller accesses a `/manage/{token}` page to reschedule or cancel without ever needing an account. This token is not single-use (a caller might revisit the page multiple times) but should be treated as invalid for action once the booking reaches a terminal state (cancelled, or the meeting time has fully passed).

---

## 9. Temporary Booking Pages — Exact Feature Behavior

A SEPARATE concept from regular team links — these are standalone, campaign/event-specific booking pages (e.g. "Webinar Follow-up Calls"), independent of any single team.

- **Who can create them**: Team Admin or Super Admin only (not regular members).
- **Assignment pool**: org-wide round-robin across ALL eligible members company-wide, NOT limited to the creator's team.
- **Duration**: a single fixed duration per temporary page (not a dropdown like regular team links) — this was a deliberate simplification since campaign links typically serve one specific purpose.
- **Expiry options** (admin configures exactly one of these per page):
  - Never
  - Specific Date
  - After X Days (from creation/activation)
  - After X Bookings (a running counter on the page increments on every successful booking through it; once it hits the configured limit, the page deactivates)
- **Expiry behavior**: once expired (by any of the above triggers), the link becomes COMPLETELY INACTIVE automatically — visitors see a "This link has expired" page. No new bookings are accepted. This must happen automatically, not require an admin to manually notice and deactivate it.
- The booking-count counter is increment-only — it does NOT decrement if a booking made through the page is later cancelled, because the expiry intent is about total usage volume of the link, not currently-active bookings.
- A race condition exists where two simultaneous bookings near the limit could both pass a naive "count < limit" check before either commits — this must be handled via an atomic check-and-increment database operation (UPDATE...WHERE...RETURNING pattern), not a separate read-then-write.

---

## 10. Notifications — Exact Behavior

For every successful booking, BOTH the caller and the assigned member receive notifications via TWO separate mechanisms (not just one):

1. **Google Calendar's own default invite email** — triggered automatically by creating the calendar event with `sendUpdates: "all"`, since both parties are added as attendees. This includes the date/time, Meet link, and standard calendar "add to my calendar" functionality.
2. **A custom branded email** (sent by the application itself, not Google) — containing meeting details, AND a reschedule link, AND a cancel link (both pointing to the `/manage/{token}` page from Section 8). This was explicitly requested as "the proper way Calendly does it" — Calendly sends both the calendar-native invite AND its own branded transactional email; this system replicates that same dual-notification pattern rather than relying on only one.

**Reminder emails**: sent automatically at two points — 1 day before the meeting, and 15 minutes before the meeting.

**Calendar-not-connected alerts**: as described in Section 6, sent to both the affected member and their Team Admin when a member's calendar is not connected (or has become disconnected) and they are therefore excluded from receiving bookings.

**Notification tracking philosophy**: notifications are tracked as a dispatch LEDGER (what was sent, to whom, when, success/failure, via which channel) — NOT as a store of the actual rendered email content. Email bodies are rendered fresh from templates at send-time using data that already exists elsewhere (booking details, member info); storing rendered HTML in the database would be redundant duplication.

---

## 11. Admin/Insights & Audit — Exact Behavior

- **Audit log**: tracks meaningful state-changing actions across the system (booking created/rescheduled/cancelled, member toggled active/inactive, member promoted to Team Admin, availability overridden, temporary page created/deactivated, etc.) — for accountability and traceability. Some actions are system-initiated (e.g. automatic expiry of a temporary page) rather than by a human, and the log must distinguish actor type accordingly (member vs. system vs. caller-initiated-via-token).
- **Dashboards**: scoped exactly per the role rules in Section 4 — Super Admin sees everything org-wide; Team Admin sees only their own team's bookings/utilization/cancel-rate; Member sees only their own individual data. There is no "cross-team" visibility for Team Admins under any circumstance.
- **Member utilization data** (bookings count, cancellations, reschedules, total booked time per member per day) is intended to be served from a pre-aggregated rollup table updated by a background job, NOT computed live via expensive aggregate queries across the full bookings history on every dashboard load — this is a deliberate performance/scalability choice anticipating growth in booking volume over time.
- "Cancel rate" as a displayed metric is a derived calculation at query/display time (cancelled count ÷ total count) — it is not stored as its own persisted value anywhere.

---

## 12. Reliability & Scale Requirements (Apply From Day One, Non-Negotiable)

These exist because of an explicit requirement: the system must not crash under simultaneous high traffic on day one, AND the architecture should not require a rewrite if it's ever extended to serve more organizations later. This does NOT mean building unnecessary infrastructure now — see what's explicitly excluded below.

**Must have from day one:**
- Database connection pooling (proper pool configuration, not defaults that choke under concurrent load).
- Async/non-blocking I/O for all external calls, especially Google Calendar API calls — blocking calls under concurrency starve the server.
- Database-level double-booking prevention (Section 8) — not application-only locking.
- Rate limiting on public-facing endpoints (especially the booking submission endpoint) to prevent abuse/spam/bot traffic from degrading service.
- Stateless backend design (session/state data lives in the database, not in server process memory) — this is what allows horizontally scaling to multiple server instances behind a load balancer later, without a redesign.
- Idempotency handling on booking creation (Section 8).
- Visibility into calendar-sync failures rather than silent failure (Section 8).
- Row-Level Security (RLS) enabled on every tenant-scoped Supabase table, enforcing organization-level data isolation at the DATABASE level — not relying solely on the application always remembering to filter by `organization_id` in every query. RLS policies use helper functions (`current_member_org_id()`, `current_member_role()`, `current_member_team_id()`) that resolve the current Supabase Auth session (`auth.uid()`) to the corresponding `members` row, rather than relying on custom JWT claims.
- Token/credential encryption at rest via Supabase Vault for anything sensitive (Google OAuth tokens) — not plaintext columns relying purely on application-layer discipline.

**Explicitly EXCLUDED / deferred (do not build these unless separately requested later)**:
- Billing/subscription system or any subscription-tier columns on `organizations` — this was explicitly excluded because there is no current external paying-tenant scenario; adding this now would be premature.
- Webhooks/integration-events infrastructure.
- SMS/WhatsApp notification channels — the schema has a `channel` field that allows for this conceptually in the future, but no actual SMS/WhatsApp sending logic should be built now, and doing so would also require consent-tracking infrastructure not yet designed.
- Multi-team membership per member (already decided: one member, one team, permanently, unless explicitly revisited).
- Kubernetes, auto-scaling infrastructure, microservices decomposition, multi-region deployment, CDN — the system is a single FastAPI monolith on a VPS/cloud server; this is correct for current scale and should not be over-engineered preemptively.
- Per-organization resource limits enforcement logic was added structurally (`organization_limits` table exists) but is informational scaffolding for a future multi-tenant scenario — not actively enforced against the single current organization today.

---

## 13. Database Schema — Complete Table List (Final State)

All tables use UUID primary keys (never sequential integers — booking-related URLs are public-facing and must not be guessable/enumerable). All tables below have RLS enabled except where noted.

- `organizations` — root tenant entity. Has `deleted_at` (soft-delete).
- `teams` — belongs to an organization. Has `deleted_at`. Slug unique per-org.
- `members` — belongs to an organization, optionally to one team. Has `deleted_at`, `auth_user_id` (FK to `auth.users`, nullable), `role` (CHECK-constrained VARCHAR: `super_admin`/`team_admin`/`member`, NOT a native Postgres ENUM — chosen for easier future alteration), `is_active_for_booking` (the round-robin toggle). Does NOT have any password/auth columns (Supabase Auth handles this).
- `calendar_connections` — 1:1 with members (UNIQUE constraint on `member_id`), stores encrypted Google OAuth tokens (via Vault), connection status, refresh error tracking, `provider` field (currently always `'google'`, included for future extensibility), `deleted_at`.
- `org_availability_defaults` — one row per organization, weekly schedule as JSONB, timezone, buffer/notice/window settings.
- `team_availability_overrides` — nullable-sparse override per team, same shape as org defaults, plus `last_modified_by_member_id` for accountability.
- `member_availability_overrides` — nullable-sparse override per member, same shape, plus `last_modified_by_member_id`.
- `member_date_blocks` — specific-date leave/holiday exceptions per member, supports full-day or partial-day blocks, checked AFTER the cascade resolves (not part of the cascade itself).
- `bookings` — the central transactional table. Key fields: `organization_id`, nullable `team_id` (null for temp-page bookings), nullable `assigned_member_id` (SET NULL on member deletion, to preserve booking history even if the employee leaves), nullable `temporary_page_id`, caller details, `custom_form_responses` (JSONB), start/end time (UTC, with caller's timezone stored separately), `status` (`confirmed`/`rescheduled`/`cancelled`), `google_event_id`, `google_meet_link`, `rescheduled_from_booking_id` (self-referencing), `idempotency_key`, `calendar_sync_status` + related retry-tracking fields. Has the critical `EXCLUDE USING gist` constraint preventing overlapping confirmed bookings for the same member (requires `btree_gist` extension).
- `temporary_booking_pages` — standalone campaign links, expiry-type/value fields with a CHECK constraint ensuring only the relevant expiry field is populated per type, `current_booking_count`, `is_active`, `deactivation_reason`.
- `booking_tokens` — independently-generated secure tokens for no-login reschedule/cancel access, linked to a booking.
- `notifications` — dispatch ledger (not content store) covering booking confirmations, reminders, and calendar-not-connected alerts, with a `channel` field (`email` active today, `sms`/`whatsapp` schema-ready but unimplemented).
- `audit_logs` — polymorphic `entity_type`/`entity_id` reference (deliberately NOT a real foreign key, because audit history must survive even if the referenced entity is later deleted), `actor_member_id` (nullable, for system-initiated actions), `before_state`/`after_state` JSONB snapshots (should capture only changed fields, not full-row snapshots, to keep the table lean), open-ended `action` VARCHAR (not CHECK-enumerated, since audit trails must remain extensible without migrations).
- `member_utilization_daily` — pre-aggregated rollup table (member/team/org scoped, per-day), computed by a background job, exists specifically to keep dashboard queries fast at scale rather than aggregating the full `bookings` table live every time.
- `organization_limits` — per-org resource caps (max teams, max members per team, max bookings/month, max temp pages) — structural scaffolding for future multi-tenant abuse prevention, not actively enforced today.

**Key cross-cutting design patterns used throughout**:
- Nullable-override cascade pattern (org → team → member) wherever cascading configuration exists.
- VARCHAR + CHECK constraints instead of native Postgres ENUM types for any field expected to evolve (role, status, expiry_type, etc.) — chosen specifically because ENUM types are operationally painful to alter later, while CHECK constraints are trivially migrated.
- Soft-delete (`deleted_at`) standardized across entity tables, distinct from `is_active`-style booleans which represent a different concept (operational toggle, not deletion).
- JSONB used deliberately for configuration-shaped or variable-shape data (weekly schedules, custom form responses, audit snapshots) where the consuming logic is application code anyway and rigid normalization would add query complexity without real benefit — NOT used as a lazy substitute for proper relational modeling where real foreign-key integrity matters (which is why audit logs' entity reference is the one deliberate exception to "always use real FKs," explicitly justified by the requirement that audit history must outlive the entities it describes).

---

## 14. Build Phase Order (Do Not Skip or Reorder Without Explicit Approval)

1. ✅ **Database Schema** — COMPLETE (7 design sub-phases + 9 production-hardening improvements applied, including the Supabase Auth migration described in Section 5)
2. 🔄 **Auth & Roles Module** — IN PROGRESS (see STATE.md for exact sub-task status)
3. **Availability Engine** — cascading resolution logic + slot generation, built against Section 7's rules
4. **Booking Engine** — round-robin assignment, calendar event creation, double-booking handling, built against Section 8's rules
5. **Notifications** — built against Section 10's rules
6. **Reschedule/Cancel + Admin/Insights** — built against Sections 8 (reschedule/cancel) and 11 (dashboards/audit)
7. **Frontend (React)** — built last, against stable backend API contracts; covers public booking pages, confirmation/reschedule/cancel pages, calendar-connect page, Team Admin dashboard, Super Admin dashboard

**Working method for all phases**: incremental, reviewed, one part at a time. Each new part must carry forward the context/decisions of all previous parts and must conform exactly to this architecture document. Do not attempt to build multiple phases simultaneously. Do not silently introduce features or behaviors not described in this document — if something is genuinely ambiguous or missing here, flag it explicitly rather than guessing.

**Current working-mode rule for an AI assistant continuing this project**: deliver short architecture breakdowns plus a single Claude-ready copy-paste implementation prompt per phase/sub-phase — not full code, not long explanations — unless explicitly asked to deviate from this. Always check this document and the accompanying STATE.md before proposing next steps, and never contradict anything written here.