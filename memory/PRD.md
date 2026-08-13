# InstaMenu 2.0 — Product Requirements & Build Log

## Original problem statement
Rebuild the legacy PHP/MySQL InstaMenu digital menu-board SaaS as a modern platform.
Restaurants display menus, promo images and videos on televisions via Amazon Fire TV sticks.
Hierarchy: Super Admin → Restaurant Organization → Location → Screens → Playlists → Media → Fire TV Player → Television.
Fire TV app must stay a dumb player; all business logic lives in the web backend so new features
ship without new APK releases. Multi-tenant, secure, portable, owner-maintainable.

## User choices (June 2026 kickoff)
- Scope: everything web-side; Fire TV APK later.
- Auth: JWT email/password with roles.
- Media storage: Emergent object storage (S3-style, swappable).
- Fire TV player: build after the web API is verified.
- Design: delegated to the design agent (orange/zinc Swiss-minimal SaaS, Outfit + Inter).

## Architecture
- Backend: FastAPI, modular. `core/` (db, security, storage, deps, models) + `routers/`
  (auth, admin, org, media, screens, devices, device_api). All routes under `/api`.
- Database: MongoDB. Collections: users, organizations, locations, screens, playlists,
  media, devices, pairing_codes, device_heartbeats, schedules, audit_logs, login_attempts.
  Every document uses a uuid `id`; every tenant document carries `org_id` and all tenant
  queries are filtered by it (isolation enforced in `require_org_user`).
- Storage: `core/storage.py` is the only storage-aware module — swap it to plain S3 to migrate hosts.
- Media is never served from storage directly; it goes through `/api/media/{id}/file`
  authenticated by user JWT (`?auth=`) or persistent device token (`?device_token=`).
- Playlist versioning: any change to playlist items `$inc`s `version`; devices compare their
  version against the server and only then re-download. Enables safe TV updates.
- Scheduling: `schedules` collection + `resolve_active_playlist()` already resolves
  day-of-week / time-window playlists server-side; UI for it is still to be built.

## User personas
1. **Super Admin (platform owner)** — creates/disables/deletes restaurants, manages users and
   passwords, sees every screen/device/storage figure, changes plans, enters "support mode"
   (scoped impersonation token) to help a restaurant, reads the audit log.
2. **Restaurant Owner / Manager** — one organization only. Locations, screens, media, playlists,
   playlist assignment, device pairing/renaming/reassignment, device status, team members.
3. **Display Device (Fire TV)** — authenticates with a persistent device token issued at pairing.
   Never sees user credentials.

## Implemented (2026-06)
- JWT auth: bcrypt hashing, access + refresh httpOnly cookies plus Bearer fallback,
  per-email brute-force lockout (5 attempts / 15 min), password change, super admin seeding.
- Super Admin area: platform overview stats, restaurants CRUD + status toggle + owner creation,
  users CRUD + password reset + enable/disable, subscriptions (plan assignment), system page
  (all connected devices + device API contract), audit log feed.
- Restaurant dashboard: welcome header, stat cards (screens, devices online, playlists, media,
  storage), per-screen online/offline cards, 30s polling.
- Locations CRUD with screen-count guard on delete.
- Media Library: multi-upload (jpg/jpeg/png/webp/mp4, 200 MB cap, MIME + extension validation),
  PNG/JPEG dimension extraction, thumbnail grid, rename, preview dialog, usage tracking,
  soft-delete with in-use warning + force confirm.
- Screens: CRUD, orientation/resolution/image-fit/default-duration, detail page with live
  16:9 TV preview (play/pause/prev/next, video auto-advance), playlist assignment, device assignment.
- Playlists: create/rename/duplicate/delete, two-pane editor with @hello-pangea/dnd reordering,
  per-image duration, videos play full length, live preview, version badge.
- Device pairing: TV requests a 6-digit code (15 min TTL, TTL index), dashboard enters the code and
  picks location/screen/name, backend issues a persistent device token; codes are single-use.
- Device REST API: `/api/device/pair/request`, `/pair/status`, `/config`, `/playlist`, `/heartbeat`.
  Manifest returns externally reachable media URLs (`PUBLIC_BASE_URL`) plus cache keys.
- Heartbeat monitoring: last_seen, app version, reported playlist version, `update_available` flag,
  online/offline (120 s window) shown as pulsing dots across dashboard, screens, devices, admin.
- Seed script `backend/seed_demo.py` for a demo restaurant.

## Verified
Curl end-to-end: login → dashboard → pair request → dashboard pair → pair status → config →
playlist manifest → heartbeat; media upload → `?auth=` fetch → device-token fetch; playlist
version increments on edit; brute-force lockout returns 429. Testing agent iteration 1 run;
its 3 reported bugs (internal media URL, dead `?auth=` fallback, IP-keyed lockout) are fixed.

## Backlog
### P0 — next
- Fire TV / Android TV player APK (Media3/ExoPlayer): pairing screen, config+playlist polling,
  local media cache, safe two-phase playlist swap, offline playback, wake-lock, crash/boot recovery.
### P1
- Scheduling UI on top of the existing schedules API (breakfast/lunch/dinner windows).
- Legacy migration script (legacy restaurant → org/location, screens, images → media + playlist items).
- Screen-limit enforcement per subscription plan; billing provider integration.
- Password reset by email (Resend) instead of admin-set passwords.
### P2
- Per-location media scoping filters, bulk media tagging/folders.
- Device remote actions (restart player, force refresh, screenshot).
- Analytics: playback proof-of-display reporting.
- Migrate `@app.on_event` to lifespan; explicit CORS origin for custom domains.

## Credentials
See `/app/memory/test_credentials.md`.
