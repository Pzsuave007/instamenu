# InstaMenu 2.0 — Product Requirements & Build Log

## Original problem statement
Rebuild the legacy PHP/MySQL InstaMenu digital menu-board SaaS as a modern platform.
Restaurants display menus, promo images and videos on televisions via Amazon Fire TV sticks.
Hierarchy: Super Admin → Restaurant Organization → Location → Screens → Playlists → Media → Fire TV Player → Television.
The Fire TV app must stay a dumb player; all business logic lives in the web backend so new features
ship without new APK releases. Multi-tenant, secure, portable, owner-maintainable.

## User choices
- Kickoff: web-side first (Fire TV APK later), JWT email/password auth, Emergent object storage,
  design delegated to the design agent (orange/zinc Swiss-minimal SaaS, Outfit + Inter).
- After first review: *"easy to use, easy to upload videos, easy to assign videos to screens,
  and be able to see how they are going to look"* → the screen page became the single content hub.
- Player round: deliver **both** a browser player and native Android/Kotlin source; APK built by
  **GitHub Actions**; video audio **always muted**; idle/offline shows the **restaurant name on black**.

## Architecture
- Backend: FastAPI, modular. `core/` (db, security, storage, deps, models) + `routers/`
  (auth, admin, org, media, screens, devices, device_api). All routes under `/api`.
- Database: MongoDB. Collections: users, organizations, locations, screens, playlists, media,
  devices, pairing_codes, device_heartbeats, schedules, audit_logs, login_attempts. Every document
  uses a uuid `id`; every tenant document carries `org_id`, enforced centrally in `require_org_user`.
- Storage: `core/storage.py` is the only storage-aware module — swap it for plain S3 to move hosts.
- Media never leaves storage directly; it is served by `/api/media/{id}/file`, authenticated by a
  user JWT (`?auth=`) or a device token (`?device_token=`). Device manifests use `PUBLIC_BASE_URL`.
- Playlist versioning drives everything: any item change `$inc`s `version`; devices compare their
  version with the server and only then re-download.
- Every screen auto-owns a playlist (`ensure_screen_playlist`); every org auto-owns a location
  (`ensure_default_location`). Video items are clamped server-side to `duration = 0` (= full length).
- Scheduling is modelled and resolved server-side (`resolve_active_playlist`); UI still to come.

## User personas
1. **Super Admin** — restaurants, users, passwords, plans, all devices/storage, support-mode
   impersonation, audit log.
2. **Restaurant Owner / Manager** — one organization: screens and their content, media, Fire TV
   devices, team, restaurant details. Locations only matter with multiple addresses.
3. **Display Device (Fire TV)** — persistent device token issued at pairing; never sees a password.

## Implemented
### Phase 1–3 — platform
JWT auth (bcrypt, cookies + Bearer, per-email lockout), Super Admin area (overview, restaurants,
users, subscriptions, system, audit log, impersonation), Media Library (multi-upload jpg/jpeg/png/
webp/mp4, 200 MB cap, validation, dimensions, rename, preview, usage, safe delete), Screens,
Playlists + drag-drop editor, device pairing (6-digit code, 15 min TTL, single use), the device REST
API (`/pair/request`, `/pair/status`, `/config`, `/playlist`, `/heartbeat`) and heartbeat monitoring
with 120 s online/offline windows.

### Simplification pass
Add Screen asks only for a name; upload files straight onto a screen
(`POST /api/screens/{id}/content`) and reorder/retime/remove with `PUT`; the screen page is the hub
(dropzone, running order, live TV preview, advanced panel); pairing needs only code + screen;
navigation reduced to My TVs / Screens / Media Library / Fire TV Devices / Playlists / Settings with
Locations folded into Settings; screen cards show a poster of what is playing.

### Phase 4–5 — the player
- **Browser player at `/player`** (works on Fire TV Silk or any kiosk browser, outside the auth
  shell): pairing screen with the 6-digit code, auto-pairs without a reload, fullscreen muted
  playback, images on their duration, videos to completion, restaurant name on black when idle.
  Media is cached with the Cache API (`instamenu-media-v1`); the last manifest is kept in
  localStorage so a cold start with no Wi-Fi still plays, and `public/sw.js` (registered only for
  `/player`) caches the app shell so a reboot with dead Wi-Fi still reaches the player instead of a
  browser error page. Downloads complete **before** the swap,
  old blob URLs are revoked and unused cache entries pruned after activation. A dropped connection
  only shows a small amber dot; playback never stops.
- **Native Android/Kotlin app** in `/app/firetv` (minSdk 22 → every Fire TV Stick generation):
  `PlayerActivity` (pairing UI + sync loop + Media3/ExoPlayer, muted, `FLAG_KEEP_SCREEN_ON`,
  immersive fullscreen), `ApiClient` (five endpoints + streaming downloader writing `.part` then
  renaming), `MediaCache` (download → verify → activate → prune, never deletes the playing set
  early), `PlaylistStore` (last good playlist for offline cold starts), `DeviceStore`
  (hardware id / device token / version in SharedPreferences), `BootReceiver` (restart after a
  Fire TV reboot). Server URL is a build flag (`-PinstamenuApiBaseUrl=…`), so the app follows the
  backend to any host.
- **`.github/workflows/firetv-apk.yml`** builds a downloadable APK on push or on demand and also
  publishes it to a fixed `firetv-latest` GitHub release; `/app/firetv/README.md` covers Android
  Studio, ADB sideloading and production signing.
- **Self-hosted APK distribution** (`routers/player_app.py`): Super Admin uploads the APK once under
  System, and every television installs it by typing one short link — `/api/apk` — into the Fire TV
  Downloader app. No GitHub, Drive, USB or ADB. The restaurant Devices page shows the same link.
  Upload is super-admin only; the download endpoint is deliberately public (it is an installer).
- Heartbeat no longer rejects rapid calls (the old 1 s 429 made real players flag themselves
  offline); it skips the log row instead.

- **Screen content from the library**: the screen page has a primary **Choose from library** picker
  (multi-select tiles with numbered order badges) alongside secondary **Upload new** + dropzone, so
  media already uploaded is reused instead of re-uploaded. The same file can back several screens.
- **Reassignment fix**: heartbeat and both players compare the playlist **id** as well as its
  version, so moving a device to another screen switches the television even when both playlists sit
  on the same version number; `PATCH /api/devices/{id}` also clears the device's per-screen state and
  bumps the target playlist's version, so **already-installed older APKs** (which compare only
  versions and do not send `playlist_id`) also switch — no app update needed for this fix.

### Phase 6 — scheduling & library assign (2026-08-13)
- **Menu Scheduling (Time slots)**: `schedules` collection + endpoints (`GET/POST/DELETE /api/schedules`).
  Server-side `resolve_active_playlist` picks the scheduled playlist by priority, day-of-week,
  date range and time window (overnight-aware) in the location's timezone; devices get the resolved
  playlist through `/api/device/config` and `/api/device/playlist`. UI: `ScheduleCard.jsx` on the
  screen page (breakfast/lunch/dinner slots, day presets, create-new-menu inline, timezone note).
- **Add to screen from Media Library**: each media tile has an "Add to screen" action opening a
  dialog that lists all screens (`POST /api/screens/{id}/content/existing`) so a file is dropped onto
  a TV without visiting the screen page.
- Verified 2026-08-13: backend curl flow (add-to-screen, create/list/delete schedule, resolution
  logic) + UI screenshots of both dialogs. No standalone `/screens/{id}/resolved-playlist` endpoint —
  resolution lives in the device API.

## Self-hosting / cPanel deploy (2026-08-14)
User wants a permanent fixed domain so Fire TV devices never break on fork (preview URL changes).
Target: **instamenuapp.com**, cPanel user **instamenuapp**, backend port **8010**, repo
`github.com/Pzsuave007/instamenu`. Server profile: GoDaddy VPS + cPanel + AlmaLinux + Apache +
MongoDB local (Apache proxy `/api` → uvicorn, SPA fallback, nohup + crontab @reboot — no supervisor).
- **Local disk storage**: `core/storage.py` now has two backends switched by `STORAGE_BACKEND`
  (`emergent` default = preview; `local` = self-host writing to `MEDIA_STORAGE_DIR`). Same interface,
  no other code changed. Preview keeps using Emergent storage (existing media intact, verified).
- **Deploy scaffolding** at repo root + `deploy/`: `deploy.sh`, `bootstrap.sh`, `install_server.sh`,
  `fix.sh`, `publish_frontend.sh`, `start.sh`, `setup-autostart.sh`, `htaccess` (`__PORT__` templated),
  `requirements.prod.txt` (slim, no pandas/numpy/emergentintegrations), `backend.env.production.example`,
  `README.md` (Spanish steps).
- **Frontend prod build** committed: `frontend/.env.production` bakes `REACT_APP_BACKEND_URL=
  https://instamenuapp.com`; `/build` un-ignored in `.gitignore` so build ships in the repo (VPS has
  low RAM — build in Emergent, copy to public_html on server). Build verified, domain baked in bundle.
- **Native APK** default `instamenuApiBaseUrl` → `https://instamenuapp.com` (gradle + workflow input).
- Prod env template: `DB_NAME=instamenu_prod` (fresh DB; super admin auto-seeded from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD`), `PUBLIC_BASE_URL` + `CORS_ORIGINS` set to the domain.
- Not yet run on the real server (needs their cPanel). Verified locally: local-storage unit round-trip,
  prod build success, preview unaffected.

## Python 3.9 compatibility (2026-08-14)
Self-hosted cPanel server runs **Python 3.9**; deploy crashed on import with
`TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`. Cause: PEP 604 unions
(`X | None`) are evaluated at runtime and only work on 3.10+. Fixed by converting all 4 spots to
`typing.Optional[...]`: `routers/admin.py` (`_is_online`, `list_users` org_id) and `routers/screens.py`
(`resolve_active_playlist` return, `list_schedules` screen_id). Repo-wide grep now shows 0 `|` unions.
Regression verified (testing agent iteration 5: 6/6 affected endpoints 200, no regression on 3.11).
The real 3.9 fix is confirmed when the user re-runs `deploy.sh` on their server.

## Verified
Testing agent iteration 1 (3 issues → fixed: internal media URL, dead `?auth=` fallback, IP-keyed
lockout), iteration 2 (19/19 backend, full simplified UI journey, no bugs), iteration 3 (player).
Manually verified: pairing code appears on `/player`, dashboard pairing flips the TV to content with
no reload, device reports `playing` with the right playlist version, no 429s, media round-trips.

## Backlog
### P1
- Legacy migration script (legacy restaurant → org/location, screens, images → media + items).
- Copy content from one screen to another.
- Offline-alert emails when a TV stops checking in; password reset by email (Resend).
- Screen-limit enforcement per plan; billing provider.
### P2
- Device remote actions (force refresh, restart, screenshot); proof-of-play analytics.
- Own release keystore + Play/Amazon Appstore listing for the APK.
- `DialogDescription` a11y warning; migrate `@app.on_event` to lifespan; explicit CORS origins.

## Credentials
See `/app/memory/test_credentials.md`.
