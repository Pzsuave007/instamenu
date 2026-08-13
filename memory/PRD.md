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

## Follow-up direction (June 2026, after first review)
User loved the look but found the flow too complicated: *"I need this to be easy to use, easy to
upload videos and easy to assign the videos to the screens and be able to see how they are going to look."*
The product was therefore reorganised around a single idea: **the screen page is the content hub.**
Playlists, locations and the media library still exist underneath, but a restaurant owner never has
to touch them to get a video on a TV.

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
  Device manifest URLs are built from `PUBLIC_BASE_URL` so they are reachable off-cluster.
- Playlist versioning: any change to playlist items `$inc`s `version`; devices compare their
  version against the server and only then re-download. Enables safe TV updates.
- Every screen owns an auto-created playlist (`ensure_screen_playlist`) and every org gets an
  auto-created location (`ensure_default_location`) — that is what removes the setup steps.
- Video items are server-clamped to `duration = 0`, meaning "play the whole video".
- Scheduling: `schedules` collection + `resolve_active_playlist()` already resolves
  day-of-week / time-window playlists server-side; UI for it is still to be built.

## User personas
1. **Super Admin (platform owner)** — creates/disables/deletes restaurants, manages users and
   passwords, sees every screen/device/storage figure, changes plans, enters "support mode"
   (scoped impersonation token) to help a restaurant, reads the audit log.
2. **Restaurant Owner / Manager** — one organization only. Screens, content, media, devices,
   team, restaurant details. Locations only if they run more than one address.
3. **Display Device (Fire TV)** — authenticates with a persistent device token issued at pairing.
   Never sees user credentials.

## Implemented
### Phase 1–3 (initial build)
- JWT auth: bcrypt hashing, access + refresh httpOnly cookies plus Bearer fallback,
  per-email brute-force lockout (5 attempts / 15 min), password change, super admin seeding.
- Super Admin area: platform overview stats, restaurants CRUD + status toggle + owner creation,
  users CRUD + password reset + enable/disable, subscriptions (plan assignment), system page
  (all connected devices + device API contract), audit log feed.
- Media Library: multi-upload (jpg/jpeg/png/webp/mp4, 200 MB cap, MIME + extension validation),
  PNG/JPEG dimension extraction, rename, preview, usage tracking, soft-delete with in-use warning.
- Screens CRUD; Playlists create/rename/duplicate/delete with a two-pane drag-and-drop editor.
- Device pairing (6-digit code, 15 min TTL, single use) → persistent device token.
- Device REST API: `/pair/request`, `/pair/status`, `/config`, `/playlist`, `/heartbeat`
  with `update_available`; heartbeat monitoring and 120 s online/offline windows.

### Simplification pass
- **Add Screen asks for one thing: a name.** Location and playlist are created automatically;
  everything else sits behind a collapsed "Advanced options".
- **Upload straight onto a screen**: `POST /api/screens/{id}/content` (multipart `files`) stores
  the files and appends them to that screen's loop in one request; `PUT /api/screens/{id}/content`
  reorders/retimes/removes. Both bump the playlist version.
- **Screen page is the hub**: drag-and-drop dropzone, the running order with per-image seconds,
  a live "How it looks on the TV" preview, and an Advanced panel for fit/orientation.
- **Pairing needs only the code + which screen**; device name and location default from the screen.
- **Navigation cut to** My TVs, Screens, Media Library, Fire TV Devices, Playlists, Settings.
  Locations moved into Settings (with a note that they are only needed for multiple addresses).
- Screen and dashboard cards now show a poster of what's playing (film-icon overlay for videos)
  plus the item count, so the current state is visible at a glance.

## Verified
Testing agent iteration 1 (3 bugs found → all fixed: internal media URL, dead `?auth=` fallback,
IP-keyed lockout) and iteration 2 (19/19 backend cases pass, full simplified UI journey driven in
Playwright, no backend or UI bugs; only a cosmetic shadcn Dialog a11y warning outstanding).
Curl-verified: name-only screen creation, multi-file upload onto a screen, reorder/retime persistence,
video duration clamping, pair with code+screen only, full device API loop, media round-trip.

## Backlog
### P0 — next
- Fire TV / Android TV player APK (Media3/ExoPlayer): pairing screen, config+playlist polling,
  local media cache, safe two-phase playlist swap, offline playback, wake-lock, crash/boot recovery.
### P1
- Scheduling UI on top of the existing schedules API (breakfast/lunch/dinner windows).
- Legacy migration script (legacy restaurant → org/location, screens, images → media + playlist items).
- Screen-limit enforcement per subscription plan; billing provider integration.
- Password reset by email (Resend) instead of admin-set passwords.
- Offline-alert emails when a TV stops checking in.
### P2
- Copy content from one screen to another in one click.
- Device remote actions (restart player, force refresh, screenshot).
- Analytics / proof-of-display reporting.
- `DialogDescription` on dialogs (a11y warning); migrate `@app.on_event` to lifespan;
  explicit CORS origins for custom domains.

## Credentials
See `/app/memory/test_credentials.md`.
