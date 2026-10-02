import { useCallback, useEffect, useRef, useState } from "react";
import {
  cacheAsset,
  fetchConfig,
  fetchPlaylist,
  getDeviceToken,
  pollPairing,
  prepareItems,
  pruneCache,
  readManifest,
  requestPairing,
  sendHeartbeat,
  setDeviceToken,
  writeManifest,
} from "@/lib/playerClient";

const HEARTBEAT_MS = 60000;
const PAIR_POLL_MS = 5000;

/** Fullscreen TV player. Runs on Fire TV Silk browser or any kiosk browser. */
export default function Player() {
  const [code, setCode] = useState(null);
  const [config, setConfig] = useState(null);
  const [items, setItems] = useState([]);
  const [step, setStep] = useState(0);
  const [online, setOnline] = useState(true);
  const versionRef = useRef(null);
  const playlistIdRef = useRef(null);
  const itemsRef = useRef([]);
  const slotRefs = useRef([null, null]);

  const orgName = config?.organization?.name || readManifest()?.organization || "InstaMenu";

  const activate = useCallback(
    async (playlist) => {
      if (!playlist?.items?.length) {
        itemsRef.current.forEach((i) => URL.revokeObjectURL(i.objectUrl));
        itemsRef.current = [];
        setItems([]);
        versionRef.current = playlist?.version ?? null;
        playlistIdRef.current = playlist?.playlist_id ?? null;
        writeManifest({
          playlist_id: playlistIdRef.current,
          version: versionRef.current,
          items: [],
          organization: orgName,
        });
        return;
      }
      // Download everything first; only swap once every asset is cached.
      const prepared = await prepareItems(playlist.items);
      const previous = itemsRef.current;
      itemsRef.current = prepared;
      setItems(prepared);
      setStep(0);
      versionRef.current = playlist.version;
      playlistIdRef.current = playlist.playlist_id;
      writeManifest({
        playlist_id: playlist.playlist_id,
        version: playlist.version,
        items: playlist.items,
        organization: orgName,
      });
      previous.forEach((i) => URL.revokeObjectURL(i.objectUrl));
      pruneCache(playlist.items.map((i) => i.url)).catch(() => {});
    },
    [orgName]
  );

  /** Replay the last known playlist from cache so a cold start without Wi-Fi still shows content. */
  const restoreFromCache = useCallback(async () => {
    const saved = readManifest();
    if (!saved?.items?.length) return;
    const restored = [];
    for (const item of saved.items) {
      try {
        restored.push({ ...item, objectUrl: await cacheAsset(item.url) });
      } catch {
        /* asset missing offline: skip it */
      }
    }
    if (restored.length) {
      itemsRef.current = restored;
      setItems(restored);
      versionRef.current = saved.version;
      playlistIdRef.current = saved.playlist_id ?? null;
    }
  }, []);

  // --- pairing ---
  useEffect(() => {
    if (getDeviceToken()) return;
    let timer;
    const start = async () => {
      try {
        const data = await requestPairing();
        if (data.already_paired) {
          setDeviceToken(data.device_token);
          window.location.reload();
          return;
        }
        setCode(data.code);
        timer = setInterval(async () => {
          try {
            const status = await pollPairing(data.code);
            if (status.paired) {
              clearInterval(timer);
              setDeviceToken(status.device_token);
              window.location.reload();
            }
          } catch {
            /* keep polling */
          }
        }, PAIR_POLL_MS);
      } catch {
        setTimeout(start, 10000);
      }
    };
    start();
    return () => clearInterval(timer);
  }, []);

  // --- config, content, heartbeat ---
  useEffect(() => {
    if (!getDeviceToken()) return;
    let stopped = false;

    const syncPlaylist = async () => {
      const playlist = await fetchPlaylist();
      if (playlist.version !== versionRef.current || playlist.playlist_id !== playlistIdRef.current) {
        await activate(playlist);
      }
    };

    const tick = async () => {
      try {
        const cfg = await fetchConfig();
        if (stopped) return;
        setConfig(cfg);
        setOnline(true);
        // A device reassigned to another screen gets a different playlist id, which can
        // carry the same version number — so compare the id as well as the version.
        if (
          versionRef.current === null ||
          cfg.playlist_id !== playlistIdRef.current ||
          cfg.playlist_version !== versionRef.current
        ) {
          await syncPlaylist();
        }
      } catch (err) {
        if (String(err.message) === "unauthorized") {
          setDeviceToken(null);
          window.location.reload();
          return;
        }
        setOnline(false); // Wi-Fi gone: keep playing whatever is cached
        return;
      }
      // Reported separately so a heartbeat hiccup never interrupts playback.
      try {
        const hb = await sendHeartbeat({
          app_version: "web-1.0.0",
          playlist_id: playlistIdRef.current,
          playlist_version: versionRef.current ?? 0,
          status: itemsRef.current.length ? "playing" : "idle",
        });
        if (hb.update_available) await syncPlaylist();
      } catch {
        /* the next tick reports again */
      }
    };

    restoreFromCache().finally(tick);
    const interval = setInterval(tick, HEARTBEAT_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [activate, restoreFromCache]);

  // --- keep the TV awake, and cache the app shell so an offline reboot still plays ---
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
        lock?.addEventListener?.("release", () => {
          lock = null;
        });
      } catch {
        /* not supported */
      }
    };
    acquire();
    navigator.serviceWorker?.register("/sw.js", { scope: "/player" }).catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);
    // The system can silently drop the lock (e.g. after going full screen) — re-acquire it.
    const retry = setInterval(() => {
      if (!lock) acquire();
    }, 30000);
    return () => {
      clearInterval(retry);
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);

  // --- enter full screen automatically on the first remote / mouse interaction ---
  // Browsers require a user gesture, so the first button press on the Fire TV remote
  // (or any click) flips the player into true full screen and hides the Silk browser bar.
  useEffect(() => {
    const go = () => {
      enterFullscreen();
      window.removeEventListener("keydown", go);
      window.removeEventListener("click", go);
      window.removeEventListener("pointerdown", go);
    };
    window.addEventListener("keydown", go);
    window.addEventListener("click", go);
    window.addEventListener("pointerdown", go);
    return () => {
      window.removeEventListener("keydown", go);
      window.removeEventListener("click", go);
      window.removeEventListener("pointerdown", go);
    };
  }, []);

  // --- images advance on their duration; videos advance when they end ---
  const len = items.length;
  const current = len ? items[step % len] : null;
  const nextItem = len ? items[(step + 1) % len] : null;
  const front = step % 2;

  useEffect(() => {
    if (!current || len === 0) return;
    if (current.type === "video") return;
    if (current.type === "url" && len <= 1) return; // a lone web link loops on its own
    const seconds = current.duration || config?.screen?.default_image_duration || 10;
    const t = setTimeout(() => setStep((s) => s + 1), seconds * 1000);
    return () => clearTimeout(t);
  }, [current, len, config, step]);

  // Play the front video from its start; keep the back one preloaded (first frame ready).
  // Two layers crossfade so there is no hard cut / blink between clips or on loop.
  useEffect(() => {
    if (len === 0) return;
    const f = slotRefs.current[front];
    const b = slotRefs.current[1 - front];
    if (f && f.tagName === "VIDEO") {
      try {
        f.currentTime = 0;
        const p = f.play();
        if (p && p.catch) p.catch(() => {});
      } catch {
        /* autoplay guarded by muted */
      }
    }
    if (b && b.tagName === "VIDEO") {
      try {
        b.pause();
      } catch {
        /* ignore */
      }
    }
  }, [step, len, front]);

  const imageFit = config?.screen?.image_fit || "fill";
  const fitClass = imageFit === "fit" ? "object-contain" : imageFit === "stretch" ? "" : "object-cover";

  if (!getDeviceToken()) {
    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center bg-black text-white"
        data-testid="player-pairing"
      >
        <img src="/logo.jpg" alt="InstaMenu" className="h-40 w-40 rounded-3xl object-cover shadow-2xl sm:h-48 sm:w-48" />
        <h1 className="mt-10 font-display text-4xl font-semibold">Connect this TV</h1>
        <p className="mt-14 text-sm uppercase tracking-[0.3em] text-zinc-500">Pairing code</p>
        <p
          className="mt-4 font-display text-7xl font-bold tracking-[0.2em] text-white sm:text-8xl"
          data-testid="player-pairing-code"
        >
          {code || "······"}
        </p>
        <p className="mt-14 max-w-lg text-center text-base text-zinc-400">
          Open your InstaMenu dashboard, go to Fire TV Devices, choose “Pair New Device” and enter this code.
        </p>
        <FullscreenButton />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black" data-testid="player-idle">
        <p className="font-display text-4xl font-semibold text-white/80">{orgName}</p>
        <FullscreenButton />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" data-testid="player-stage">
      {[0, 1].map((slot) => {
        const item = slot === front ? current : nextItem;
        if (!item) return null;
        const isFront = slot === front;
        const cls = `absolute inset-0 h-full w-full transition-opacity duration-700 ease-in-out ${fitClass} ${
          isFront ? "opacity-100" : "opacity-0"
        }`;
        return item.type === "video" ? (
          <video
            key={slot}
            ref={(el) => {
              slotRefs.current[slot] = el;
            }}
            src={item.objectUrl}
            className={cls}
            muted
            playsInline
            preload="auto"
            onEnded={isFront ? () => setStep((s) => s + 1) : undefined}
            onError={isFront ? () => setStep((s) => s + 1) : undefined}
            data-testid={isFront ? "player-video" : undefined}
          />
        ) : item.type === "url" ? (
          <iframe
            key={slot}
            title={item.filename || "web"}
            src={item.objectUrl}
            className={`${cls} border-0`}
            allow="autoplay; fullscreen"
            data-testid={isFront ? "player-iframe" : undefined}
          />
        ) : (
          <img
            key={slot}
            ref={(el) => {
              slotRefs.current[slot] = el;
            }}
            src={item.objectUrl}
            alt=""
            className={cls}
            data-testid={isFront ? "player-image" : undefined}
          />
        );
      })}
      {!online ? (
        <span
          className="absolute bottom-4 right-5 h-2 w-2 rounded-full bg-amber-400/70"
          title="Offline — playing saved content"
          data-testid="player-offline-dot"
        />
      ) : null}
      <FullscreenButton />
    </div>
  );
}

function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.mozRequestFullScreen;
  if (req) {
    try {
      req.call(el);
    } catch {
      /* fullscreen not allowed */
    }
  }
}

function exitFullscreen() {
  const ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
  if (ex) {
    try {
      ex.call(document);
    } catch {
      /* ignore */
    }
  }
}

/** Floating button so Fire TV Silk / any browser can hide its chrome and go full screen.
 *  Auto-hides a few seconds after entering full screen; reappears on remote/mouse activity. */
function FullscreenButton() {
  const [fs, setFs] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // While in full screen, reveal the button only on activity, then fade it out again.
  useEffect(() => {
    if (!fs) {
      setVisible(true);
      return;
    }
    let timer;
    const show = () => {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 3000);
    };
    show();
    window.addEventListener("keydown", show);
    window.addEventListener("mousemove", show);
    window.addEventListener("click", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", show);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("click", show);
    };
  }, [fs]);

  const toggle = () =>
    document.fullscreenElement || document.webkitFullscreenElement ? exitFullscreen() : enterFullscreen();

  return (
    <button
      onClick={toggle}
      data-testid="player-fullscreen-btn"
      className={`fixed bottom-4 left-4 z-50 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 backdrop-blur transition-opacity duration-500 hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/70 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {fs ? "Exit full screen" : "⛶ Full screen"}
    </button>
  );
}
