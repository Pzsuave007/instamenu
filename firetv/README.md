# InstaMenu Fire TV Player

A deliberately dumb player. It identifies itself, asks the server what to show, caches it,
and plays it forever. Every business rule lives in the InstaMenu backend, so you should
almost never need to ship a new APK.

## What it does

1. First launch shows a 6-digit pairing code (`POST /api/device/pair/request`).
2. Polls `GET /api/device/pair/status` until you enter that code in the dashboard, then stores a
   permanent device token in `SharedPreferences`. The code is never needed again and no restaurant
   password ever touches the TV.
3. Every 60 s: `GET /api/device/config` + `POST /api/device/heartbeat` (reports app version and the
   playlist version it is currently playing).
4. When the heartbeat replies `update_available: true`, it fetches `GET /api/device/playlist`,
   downloads **all** new assets to `filesDir/media`, verifies them, and only then switches. Old files
   are deleted after the swap, so a failed download can never blank the television.
5. No Internet? It keeps playing the cached playlist and retries every 30 s. A cold boot with no
   Wi-Fi replays the last saved playlist from `playlist.json`.
6. Videos play their full length via Media3/ExoPlayer, always muted. Images use the duration set in
   the dashboard. Image fit follows the screen's Fill / Fit / Stretch setting. Black background.
7. `BootReceiver` restarts playback after a Fire TV reboot; `FLAG_KEEP_SCREEN_ON` prevents sleep.

## Files

```
app/src/main/java/com/instamenu/player/
  PlayerActivity.kt   fullscreen playback loop, pairing UI, sync loop
  ApiClient.kt        the five device endpoints + streaming downloader
  MediaCache.kt       download-verify-activate, prune after swap
  PlaylistStore.kt    last good playlist for offline cold starts
  DeviceStore.kt      hardware id, device token, playlist version
  BootReceiver.kt     auto start after reboot
```

## Build it

### Option A — GitHub Actions (no tools needed)
Push this repo to GitHub. `.github/workflows/firetv-apk.yml` builds the APK on every push that
touches `firetv/`, or run it manually from the **Actions** tab (you can pass your own server URL).
Download `instamenu-firetv-apk` from the run's Artifacts.

### Option B — Android Studio
Open the `firetv` folder, let it sync (it generates the Gradle wrapper), then **Build → Build APK**.

To point the app at a different server:
```
gradle :app:assembleDebug -PinstamenuApiBaseUrl=https://otrodominio.com
```
The default is `https://instamenuapp.com`, baked into `app/build.gradle.kts` (`API_BASE_URL`).
Como es un **dominio** (no una IP), si algún día mueves el backend a otro servidor solo repuntas el
DNS de `instamenuapp.com` y la app sigue funcionando sin reinstalar ni recompilar nada.

## Install on a Fire TV Stick

1. Fire TV: **Settings → My Fire TV → Developer Options** → turn on *ADB debugging* and
   *Apps from Unknown Sources*. Note the device IP under **Settings → My Fire TV → About → Network**.
2. From your computer:
   ```
   adb connect 192.168.1.50:5555
   adb install -r app-debug.apk
   adb shell monkey -p com.instamenu.player 1
   ```
   (Or use the *Downloader* app on the Fire TV and point it at a hosted copy of the APK.)
3. The TV shows a pairing code. In the dashboard: **Fire TV Devices → Pair New Device**, type the
   code, pick the screen. Content starts within a minute.

## Try it without an APK

The same behaviour runs in a browser at `https://instamenuapp.com/player` — open that on the
Fire TV's Silk browser (or any screen) and it pairs and plays with offline caching via the Cache API.
Handy for testing and for TVs that are not Fire TV.

## Production notes

- Replace the debug signing config in `app/build.gradle.kts` with your own keystore before
  distributing to customers.
- `minSdk 22` covers every Fire TV Stick generation.
- Nothing here is host-specific: change `API_BASE_URL` and the app follows your server anywhere.
