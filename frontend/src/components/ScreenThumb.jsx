import { Film, Monitor } from "lucide-react";
import { mediaUrl } from "@/lib/apiClient";

/** Poster for a screen card: still for images, first frame for videos. */
export const ScreenThumb = ({ mediaId, kind, emptyLabel = "Nothing added yet" }) => {
  if (!mediaId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-500">
        <Monitor className="h-7 w-7" />
        <span className="text-xs">{emptyLabel}</span>
      </div>
    );
  }
  if (kind === "video") {
    return (
      <div className="relative h-full w-full">
        <video src={mediaUrl(mediaId)} className="h-full w-full object-cover" muted preload="metadata" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <Film className="h-8 w-8 text-white/90" />
        </span>
      </div>
    );
  }
  return <img src={mediaUrl(mediaId)} alt="" className="h-full w-full object-cover" />;
};
