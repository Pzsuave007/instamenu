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

## Recent fixes (2026-06)
- **CRÍTICO — RCA "MongoDB compartido se cae y tumba TODAS las webapps":** el endpoint que sirve
  media hacía `src.read_bytes()` (cargaba el video COMPLETO en RAM por petición). Con Range que se
  agregó antes, cada petición de rango de un video (los reproductores hacen decenas) cargaba los
  22MB enteros → picos de RAM → el OOM killer del kernel mataba `mongod` (proceso más grande) →
  todas las apps del VPS perdían login. Empezó justo con InstaMenu por esto.
  - FIX (código): `media.py _serve` + `storage.py local_file()` ahora **transmiten por chunks de
    256KB desde disco** (StreamingResponse) para el backend `local`. Memoria del backend queda plana
    (~KB) sin importar el tamaño. Verificado con unit test (rango medio/completo/abierto/inválido,
    byte-exact) y regresión del path emergent en preview (206/200). Requiere deploy (git pull + deploy.sh).
  - FIX (servidor, defensa en profundidad): `deploy/harden_mongo.sh` — mongod con Restart=always,
    enable on boot, `OOMScoreAdjust=-500` (el kernel mata el backend antes que mongod), swap 2GB,
    límite de WiredTiger cache (~35% RAM), swappiness=10, y watchdog por cron cada minuto.
    `deploy/diagnose_server.sh` — diagnóstico solo-lectura (RAM/OOM/logs/estado mongod).
    Se corren en el VPS como root (no puedo ejecutarlos yo).
- **Fire TV banner** arreglado + versión APK 1.1.0 (ver historial).
- **Restaurant Showroom** en el Dashboard (ver historial).

## Backlog
### P1
  ícono cuadrado. Antes `AndroidManifest` usaba `android:banner="@drawable/app_logo"` (logo cuadrado
  sobre negro → se veía mal). Se creó `firetv/app/src/main/res/drawable/banner.png` (640x360,
  compuesto con PIL usando el logo real + wordmark "InstaMenu" + tagline "Digital Menu Boards",
  fondo negro con glow naranja) y el manifest ahora apunta a `@drawable/banner`. El GitHub Action
  `firetv-apk.yml` reconstruye el APK al hacer push que toque `firetv/**` y lo publica en el release
  `firetv-latest`. Verificación final del banner: en el propio Fire TV tras reinstalar el APK.
- **Restaurant Showroom en el Dashboard** (ver historial).

## Backlog
### P1
  restaurante" que muestra las TVs del cliente montadas en una pared ilustrada de restaurante,
  reproduciendo su contenido REAL. Se auto-ajusta a la cantidad de pantallas (1, 2, 3+).
  - Nuevo componente `frontend/src/components/RestaurantShowroom.jsx` + `ShowroomTv` (video en loop
    si es único / avanza al terminar si hay varios; imágenes rotan por su duración).
  - Fondo ilustrado self-hosted en `frontend/src/assets/showroom-wall.jpg` (empaquetado en el build).
  - Backend `org.py /dashboard`: cada screen ahora incluye `preview_items`
    [{media_id, kind, duration}] (solo video/image).
  - Backend `media.py _serve`: **soporte de HTTP Range (206 Partial Content)** para streaming de
    video correcto en navegadores (antes anunciaba Accept-Ranges pero devolvía el archivo completo).
    No-range sigue devolviendo 200 completo (player/miniaturas intactos); range inválido → 416.
  - Nota: en el screenshot tool los videos H.264 salen negros porque su Chromium no trae el codec;
    en navegadores reales y Fire TV reproducen bien (verificado: imágenes renderizan, range 206 OK).
- Canva/web-link removido del webapp (ver historial previo).
- **Puerto dedicado por app (2026-06)**: el VPS self-host corre varias apps que compartian
  el puerto default 8010 -> chocaban (Ben's Road Service robaba 8010 a InstaMenu => login 404).
  Solucion: `deploy/app_port` (=8012) y TODOS los scripts (start/publish/watchdog/autostart/recover)
  leen de ahi. En preview no chocaba porque cada app esta aislada en su contenedor.
- **Bug de rutas con sudo (2026-06)**: start/publish/watchdog/autostart/fix usaban `whoami`
  (=root con sudo) => rutas `/home/root/...` => watchdogs/autostart nunca se instalaban bien.
  Ahora derivan REPO de `${BASH_SOURCE}` y CPANEL_USER del path. Funciona con sudo o root.
- **Scripts self-service de operacion**: `deploy/status.sh` (radiografia RAM/apps/OOM, read-only),
  `deploy/recover.sh` (revive Mongo+backend, blinda, verifica), `deploy/add_swap.sh` (agranda swap).
  Causa raiz de caidas por RAM identificada: app Next.js externa `ezloadndump` (puerto 3002) hace OOM.
- **Locations en el menu + edicion (2026-06)**: la pagina `Locations.jsx` (CRUD completo con
  nombre/direccion/ciudad/estado via `Edit details`) existia pero faltaba en el sidebar de AppShell.
  Agregado item "Locations" (icono MapPin). Settings/Account solo tiene add/remove simple.
  Build de produccion regenerado en `deploy/webrelease` (OJO: compilar con
  `REACT_APP_BACKEND_URL=https://instamenuapp.com yarn build`, el `.env` trae la URL de preview).
- **Reproductor web mejorado para Silk/Fire TV (2026-06)**: `Player.jsx` tiene auto-fullscreen
  al primer gesto (keydown/click/pointerdown), boton manual `player-fullscreen-btn` (auto-oculta),
  y wake-lock reforzado (re-acquire cada 30s + on visibilitychange). Contexto: Fire Stick nuevos
  4K Select(2025)/HD(2026) usan Vega OS (NO sideload, NO corre APK Android) => usar reproductor web
  en Silk. El 4K 2a gen (2023, Fire OS 8) SI permite sideload (7 taps en About). Ademas el
  screensaver del Fire TV es del sistema: ponerlo en "Never" para garantizar que no se apague.
- **Mover pantalla/Fire TV a otra localidad (2026-06)**: el device hereda `location_id` de su
  screen, pero no habia UI para cambiar la localidad de una screen existente. Agregado selector
  "Location" en `ScreenDetail.jsx` (Advanced, visible si locations>1) que hace PATCH /screens
  con `location_id` (el backend ya lo soportaba). Backend `update_screen` ahora tambien sincroniza
  `db.devices` (screen_id -> nuevo location_id) para que el Fire TV emparejado se mueva con la screen.
  Verificado por curl (crear 2a loc -> PATCH screen -> location_id/location_name OK).
- **Anti-screensaver en reproductor web (2026-06)**: agregado `nosleep.js` (^0.12.0). En el primer
  gesto del usuario, `Player.jsx` llama `noSleep.enable()` (video oculto en loop) para que Fire OS
  crea que hay video activo y NO lance el screensaver del sistema (que al tocarlo mandaba Silk a la
  tienda). Se re-activa on visibilitychange. NOTA: el screensaver es del sistema; recomendar tambien
  poner "Start time" al maximo. Garantia 100% solo con la app nativa (FLAG_KEEP_SCREEN_ON) en Fire OS.
- **Editar email+password de cuentas existentes desde Admin (2026-06)**: `UserUpdate` ahora incluye
  `email` (EmailStr); `PATCH /admin/users/{id}` normaliza email a minusculas y valida unicidad
  (clash con `id: {$ne}`). Frontend `AdminUsers.jsx`: boton lapiz por fila -> dialog "Edit user"
  (name, email login, new password opcional que llama reset-password). Verificado por curl
  (cambiar email/pw -> login nuevo 200, viejo 401, revert OK) y screenshot UI.
- **Amazon Appstore prep (2026-06)**: pagina publica `/privacy` (Privacy.jsx, ruta publica en App.js)
  para Uni2 Marketing Group, contacto pzsuave007@gmail.com. Assets en `frontend/public/store-assets/`:
  icon-512.png (PNG 512x512), screenshot-1-menu-1280x720.png, screenshot-2-promo-1280x720.png,
  feature-1920x1080.png (generados con nano banana, convertidos a PNG/16:9 con Pillow). Categoria: Business.
  Nombre tienda: InstaMenu. APK firmado: el usuario lo tiene (GitHub Actions). Pendiente del usuario:
  crear una cuenta demo en produccion para el revisor de Amazon.
- **Seed cuenta demo (2026-06)**: `backend/scripts/seed_demo.py` + `deploy/seed_demo.sh` crean
  (idempotente) la cuenta demo `demo@instamenuapp.com` / `DemoReview2026` con org/location/2 imagenes
  (de store-assets via put_object)/playlist/screen. Carga backend/.env manualmente (quita comillas),
  agrega BACKEND_DIR a sys.path. Verificado en preview (login + screens/media/playlists OK).
- **Rebrand: quitar Fire TV/Amazon (2026-06)**: el usuario migro a un Android stick generico (AOSP)
  que corre el APK nativo sin trabas. Se reemplazaron TODAS las referencias "Fire TV / Fire Stick /
  Amazon / Fire OS" por "InstaMenu Player / player" en frontend (AppShell nav -> "Players", Login,
  Devices, Dashboard, Screens, MediaLibrary, ScreenDetail, AdminSystem, Player.jsx) y comentarios
  backend (screens/device_api/player_app). Build verificado: 0 referencias Fire TV. Mensaje: "nuestra
  propia tecnologia / nuestro propio stick que proveemos".
- **Fix descarga APK (2026-06)**: el usuario tecleaba `instamenuapp.com/insta8.apk`
  (archivo estático inexistente) y el SPA fallback devolvía el home. Ahora `deploy/htaccess`
  sirve cualquier `*.apk`: si existe físicamente en public_html lo entrega con MIME correcto,
  si no existe lo hace proxy a `/api/apk` (último APK subido en Super Admin). Además
  `/api/apk` usa `FileResponse` (streaming desde disco) en backend local para no cargar el
  APK entero en RAM. El nombre de versión ya no importa (insta8/app.apk/etc.).

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
