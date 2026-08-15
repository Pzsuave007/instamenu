/**
 * Device-side API + offline media cache for the browser player.
 * Uses plain fetch (no cookies) and the Cache API so media survives a Wi-Fi outage.
 */
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CACHE_NAME = "instamenu-media-v1";
const HW_KEY = "im_hardware_id";
const TOKEN_KEY = "im_device_token";
const MANIFEST_KEY = "im_manifest";

export const getHardwareId = () => {
  let id = localStorage.getItem(HW_KEY);
  if (!id) {
    id = `web-${(crypto.randomUUID?.() || String(Date.now() + Math.random())).slice(0, 18)}`;
    localStorage.setItem(HW_KEY, id);
  }
  return id;
};

export const getDeviceToken = () => localStorage.getItem(TOKEN_KEY);
export const setDeviceToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export const readManifest = () => {
  try {
    return JSON.parse(localStorage.getItem(MANIFEST_KEY) || "null");
  } catch {
    return null;
  }
};
export const writeManifest = (m) => localStorage.setItem(MANIFEST_KEY, JSON.stringify(m));

const deviceHeaders = () => ({ "X-Device-Token": getDeviceToken() || "", "Content-Type": "application/json" });

export async function requestPairing() {
  const res = await fetch(`${API}/device/pair/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hardware_id: getHardwareId(), app_version: "web-1.0.0", model: "Browser Player" }),
  });
  if (!res.ok) throw new Error("pair request failed");
  return res.json();
}

export async function pollPairing(code) {
  const res = await fetch(`${API}/device/pair/status?hardware_id=${encodeURIComponent(getHardwareId())}&code=${code}`);
  if (!res.ok) throw new Error("pair status failed");
  return res.json();
}

export async function fetchConfig() {
  const res = await fetch(`${API}/device/config`, { headers: deviceHeaders() });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`config ${res.status}`);
  return res.json();
}

export async function fetchPlaylist() {
  const res = await fetch(`${API}/device/playlist`, { headers: deviceHeaders() });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`playlist ${res.status}`);
  return res.json();
}

export async function sendHeartbeat(body) {
  const res = await fetch(`${API}/device/heartbeat`, {
    method: "POST",
    headers: deviceHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`heartbeat ${res.status}`);
  return res.json();
}

/** Returns a blob URL, downloading and caching the asset only if it isn't cached yet. */
export async function cacheAsset(url) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(url, { ignoreSearch: true });
  if (hit) return URL.createObjectURL(await hit.blob());
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  await cache.put(url, res.clone());
  return URL.createObjectURL(await res.blob());
}

/** Downloads every item BEFORE the caller activates the new playlist (safe swap). */
export async function prepareItems(items) {
  const prepared = [];
  for (const item of items) {
    if (item.type === "url") {
      prepared.push({ ...item, objectUrl: item.url });
    } else {
      prepared.push({ ...item, objectUrl: await cacheAsset(item.url) });
    }
  }
  return prepared;
}

/** Drops cached files that the current manifest no longer references. */
export async function pruneCache(keepUrls) {
  const cache = await caches.open(CACHE_NAME);
  const keep = new Set(keepUrls.map((u) => u.split("?")[0]));
  for (const req of await cache.keys()) {
    if (!keep.has(req.url.split("?")[0])) await cache.delete(req);
  }
}
