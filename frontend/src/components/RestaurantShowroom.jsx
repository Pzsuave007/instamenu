import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/apiClient";
import wallScene from "@/assets/showroom-wall.jpg";

/** One television inside the mockup: cycles through its screen's real content. */
const ShowroomTv = ({ screen, style }) => {
  const items = screen.preview_items || [];
  const [index, setIndex] = useState(0);
  const total = items.length;
  const current = items[index] || null;

  useEffect(() => {
    if (index >= total) setIndex(0);
  }, [total, index]);

  useEffect(() => {
    if (!current || current.kind === "video") return; // videos advance on 'ended'
    const ms = (current.duration || 10) * 1000;
    const t = setTimeout(() => setIndex((i) => (total ? (i + 1) % total : 0)), ms);
    return () => clearTimeout(t);
  }, [current, total]);

  const advance = () => setIndex((i) => (total ? (i + 1) % total : 0));

  return (
    <div className="absolute" style={style} data-testid={`showroom-tv-${screen.id}`}>
      {/* wall mount + bezel */}
      <div className="rounded-[10px] bg-zinc-950 p-[3px] shadow-[0_14px_30px_-10px_rgba(0,0,0,0.55)] ring-1 ring-black/20">
        <div className="relative aspect-video w-full overflow-hidden rounded-[7px] bg-black">
          {current ? (
            current.kind === "video" ? (
              <video
                key={current.media_id}
                src={mediaUrl(current.media_id)}
                className="h-full w-full object-cover"
                autoPlay
                muted
                playsInline
                preload="auto"
                loop={total <= 1}
                onEnded={total > 1 ? advance : undefined}
                data-testid={`showroom-tv-${screen.id}-video`}
              />
            ) : (
              <img
                key={current.media_id}
                src={mediaUrl(current.media_id)}
                alt={screen.name}
                className="h-full w-full object-cover"
                data-testid={`showroom-tv-${screen.id}-image`}
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-[10px] text-zinc-500">
              No content
            </div>
          )}
          {/* subtle screen glare */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/10" />
        </div>
      </div>
      {/* screen label under the TV */}
      <p className="mt-1.5 truncate text-center text-[11px] font-medium text-zinc-600">{screen.name}</p>
    </div>
  );
};

/**
 * Realistic in-restaurant mockup that plays each screen's real content on wall
 * mounted TVs. Auto-adjusts to how many screens the customer has (1, 2, 3+).
 */
export const RestaurantShowroom = ({ screens = [], testId = "restaurant-showroom" }) => {
  const withContent = screens.filter((s) => (s.preview_items || []).length > 0);
  const n = withContent.length;
  if (n === 0) return null;

  // TV width (% of scene) shrinks as the count grows so up to 3 fit nicely in a row.
  const widthByCount = { 1: 40, 2: 34, 3: 27 };
  const w = widthByCount[n] || 22;
  const gap = 4; // % gap between TVs
  const rowWidth = n * w + (n - 1) * gap;
  const startLeft = (100 - rowWidth) / 2;

  return (
    <div className="mb-10" data-testid={testId}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-zinc-900">How it looks in your restaurant</h2>
          <p className="mt-1 text-sm text-zinc-500">
            A realistic preview of your TVs already installed, playing your current content.
          </p>
        </div>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-2xl border border-zinc-200 bg-cover bg-center shadow-sm"
        style={{ backgroundImage: `url(${wallScene})`, aspectRatio: "1264 / 848" }}
        data-testid="showroom-scene"
      >
        {withContent.map((s, i) => (
          <ShowroomTv
            key={s.id}
            screen={s}
            style={{
              width: `${w}%`,
              left: `${startLeft + i * (w + gap)}%`,
              top: "13%",
            }}
          />
        ))}
      </div>
    </div>
  );
};
