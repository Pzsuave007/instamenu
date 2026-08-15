/* InstaMenu player app shell cache.
 * Registered only by /player so a Fire TV that reboots with no Wi-Fi can still
 * start the player and replay its cached media instead of showing an error page.
 * Media files themselves are cached by the page in 'instamenu-media-v1'.
 */
const SHELL = "instamenu-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // device API must always hit the network

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.status === 200) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch (offline) {
        const hit =
          (await cache.match(request)) ||
          (request.mode === "navigate" ? await cache.match("/player") : null);
        if (hit) return hit;
        throw offline;
      }
    })()
  );
});
