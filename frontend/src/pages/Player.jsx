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
  const [index, setIndex] = useState(0);
  const [online, setOnline] = useState(true);
  const versionRef = useRef(null);
  const itemsRef = useRef([]);
  const videoRef = useRef(null);

  const orgName = config?.organization?.name || readManifest()?.organization || "InstaMenu";

  const activate = useCallback(async (playlist) => {
    if (!playlist?.items?.length) {
      setItems([]);
      itemsRef.current = [];
      versionRef.current = playlist?.version ?? null;
      return;
    }
    // Download everything first; only swap once all assets are on disk.
    const prepared = await prepareItems(playlist.items);
    itemsRef.current = prepared;
    setItems(prepared);
    setIndex(0);
    versionRef.current = playlist.version;
    writeManifest({ version: playlist.version, items: playlist.items, organization: orgName });
    pruneCache(playlist.items.map((i) => i.url)).catch(() => {});
  }, [orgName]);

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
      if (playlist.version !== versionRef.current) await activate(playlist);
    };

    const tick = async () => {
      try {
        const cfg = await fetchConfig();
        if (stopped) return;
        setConfig(cfg);
        setOnline(true);
        if (versionRef.current === null || cfg.playlist_version !== versionRef.current) await syncPlaylist();
      } catch (err) {
        if (String(err.message) === "unauthorized") {
          setDeviceToken(null);
          window.location.reload();
          return;
        }
        setOnline(false); // Wi-Fi gone: keep playing whatever is cached
        return;
      }
      // Heartbeat is reported separately so a hiccup here never stops playback.
      try {
        const hb = await sendHeartbeat({
          app_version: "web-1.0.0",
          playlist_version: versionRef.current ?? 0,
          status: itemsRef.current.length ? "playing" : "idle",
        });
        if (hb.update_available) await syncPlaylist();
      } catch {
        /* ignore: the next tick will report again */
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
    let lock;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* not supported */
      }
    };
    acquire();
    navigator.serviceWorker?.register("/sw.js", { scope: "/player" }).catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, []);

  // --- advance images on their duration; videos advance when they end ---
  const current = items[index];
  useEffect(() => {
    if (!current || items.length === 0) return;
    if (current.type === "video") return;
    const seconds = current.duration || config?.screen?.default_image_duration || 10;
    const t = setTimeout(() => setIndex((i) => (i + 1) % items.length), seconds * 1000);
    return () => clearTimeout(t);
  }, [current, items, config]);

  const fitClass =
    (config?.screen?.image_fit || "fill") === "fit"
      ? "object-contain"
      : (config?.screen?.image_fit || "fill") === "stretch"
        ? ""
        : "object-cover";

  if (!getDeviceToken()) {
    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center bg-black text-white"
        data-testid="player-pairing"
      >
        <p className="font-display text-2xl tracking-[0.35em] text-orange-500">INSTA MENU</p>
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
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black" data-testid="player-idle">
        <p className="font-display text-4xl font-semibold text-white/80">{orgName}</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" data-testid="player-stage">
      {current.type === "video" ? (
        <video
          ref={videoRef}
          key={`${current.id}-${index}`}
          src={current.objectUrl}
          className={`h-full w-full ${fitClass}`}
          autoPlay
          muted
          playsInline
          onEnded={() => setIndex((i) => (i + 1) % items.length)}
          onError={() => setIndex((i) => (i + 1) % items.length)}
          data-testid="player-video"
        />
      ) : (
        <img
          key={`${current.id}-${index}`}
          src={current.objectUrl}
          alt=""
          className={`h-full w-full ${fitClass}`}
          data-testid="player-image"
        />
      )}
      {!online ? (
        <span
          className="absolute bottom-4 right-5 h-2 w-2 rounded-full bg-amber-400/70"
          title="Offline — playing saved content"
          data-testid="player-offline-dot"
        />
      ) : null}
    </div>
  );
}
