import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaUrl } from "@/lib/apiClient";

/** Simulates what a paired television is currently showing for a playlist. */
export const TvPreview = ({ items = [], imageFit = "fit", playlistName, testId = "tv-preview" }) => {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef(null);
  const total = items.length;
  const current = items[index];

  const fitClass = useMemo(() => {
    if (imageFit === "fill") return "object-cover";
    if (imageFit === "stretch") return "w-full h-full";
    return "object-contain";
  }, [imageFit]);

  useEffect(() => {
    if (index >= total) setIndex(0);
  }, [total, index]);

  useEffect(() => {
    if (!playing || total === 0 || !current) return;
    if (current.media?.kind === "video") return; // video advances on 'ended'
    const ms = (current.duration || 10) * 1000;
    const t = setTimeout(() => setIndex((i) => (i + 1) % total), ms);
    return () => clearTimeout(t);
  }, [playing, index, total, current]);

  const step = (delta) => setIndex((i) => (total ? (i + delta + total) % total : 0));

  return (
    <div className="w-full" data-testid={testId}>
      <div className="relative rounded-2xl bg-zinc-900 p-2 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.55)] im-grain">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          {!current ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-zinc-500">
              <Tv className="h-10 w-10" />
              <p className="text-sm">No content assigned yet</p>
            </div>
          ) : current.media?.kind === "video" ? (
            <video
              ref={videoRef}
              key={current.media.id}
              src={mediaUrl(current.media.id)}
              className={`h-full w-full ${fitClass}`}
              autoPlay={playing}
              muted
              playsInline
              onEnded={() => step(1)}
              data-testid="tv-preview-video"
            />
          ) : current.media?.kind === "url" ? (
            <iframe
              key={current.media.id}
              title={current.media.name || "web"}
              src={current.media.url}
              className="h-full w-full border-0"
              allow="autoplay; fullscreen"
              data-testid="tv-preview-iframe"
            />
          ) : (
            <img
              key={current.media.id}
              src={mediaUrl(current.media.id)}
              alt={current.media.name}
              className={`h-full w-full ${fitClass}`}
              data-testid="tv-preview-image"
            />
          )}
          {current ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-4">
              <span className="truncate text-xs font-medium text-white/90">{current.media?.name}</span>
              {current.media?.kind !== "url" ? (
                <span className="shrink-0 text-xs text-white/70" data-testid="tv-preview-position">
                  Slide {index + 1} of {total}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-500">
          {playlistName ? <span className="font-medium text-zinc-800">{playlistName}</span> : "No playlist"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => step(-1)}
            disabled={!total}
            data-testid="tv-preview-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="rounded-full"
            onClick={() => setPlaying((p) => !p)}
            disabled={!total}
            data-testid="tv-preview-toggle"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => step(1)}
            disabled={!total}
            data-testid="tv-preview-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
