import { useEffect, useRef, useState } from "react";
import { Film, Image as ImageIcon, MonitorPlay, Pencil, Trash2, Upload } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiError, formatBytes, formatDate, mediaUrl } from "@/lib/apiClient";
import { toast } from "sonner";

export default function MediaLibrary() {
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState("");
  const [preview, setPreview] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [screens, setScreens] = useState([]);
  const inputRef = useRef(null);

  const openAssign = (item) => {
    setAssigning(item);
    api.get("/screens").then((r) => setScreens(r.data)).catch(() => {});
  };

  const addToScreen = async (screen) => {
    try {
      const { data } = await api.post(`/screens/${screen.id}/content/existing`, { media_ids: [assigning.id] });
      toast.success(`Added to “${data.screen_name}” — the TV updates by itself`);
      setAssigning(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const load = () => api.get("/media").then((r) => setMedia(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
    api.get("/screens").then((r) => setScreens(r.data)).catch(() => {});
  }, []);

  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        ok += 1;
      } catch (e) {
        toast.error(`${file.name}: ${apiError(e)}`);
      }
    }
    setUploading(false);
    if (ok) toast.success(`${ok} file${ok > 1 ? "s" : ""} uploaded`);
    load();
  };

  const rename = async () => {
    try {
      await api.patch(`/media/${renaming.id}`, { name: newName });
      toast.success("Renamed");
      setRenaming(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (item) => {
    try {
      await api.delete(`/media/${item.id}`);
      toast.success("File deleted");
      load();
    } catch (e) {
      const msg = apiError(e);
      if (e?.response?.status === 409 && window.confirm(`${msg}\n\nDelete it anyway?`)) {
        await api.delete(`/media/${item.id}?force=true`);
        toast.success("File deleted and removed from playlists");
        load();
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <AppShell>
      <PageHeader title="Media Library" subtitle="JPG, PNG, WEBP and MP4 files, shared across your locations.">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.mp4"
          className="hidden"
          onChange={(e) => upload(e.target.files)}
          data-testid="media-file-input"
        />
        <Button
          className="rounded-full px-5"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          data-testid="upload-media-button"
        >
          <Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading…" : "Upload Media"}
        </Button>
      </PageHeader>

      {media.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="Your library is empty"
          description="Upload menu images or promo videos, then drop them into a playlist."
          actionLabel="Upload Media"
          onAction={() => inputRef.current?.click()}
          testId="media-empty"
        />
      ) : (
        <div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-testid="media-grid"
        >
          {media.map((m) => (
            <Card key={m.id} className="overflow-hidden border-zinc-200 shadow-sm" data-testid={`media-card-${m.id}`}>
              <button
                className="group relative block aspect-video w-full overflow-hidden bg-zinc-900"
                onClick={() => setPreview(m)}
                data-testid={`preview-media-${m.id}`}
              >
                {m.kind === "video" ? (
                  <>
                    <video src={mediaUrl(m.id)} className="h-full w-full object-cover opacity-80" muted />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Film className="h-8 w-8 text-white/90" />
                    </span>
                  </>
                ) : (
                  <img
                    src={mediaUrl(m.id)}
                    alt={m.name}
                    className="h-full w-full object-cover duration-300 group-hover:scale-105"
                  />
                )}
              </button>
              <div className="p-4">
                <p className="truncate text-sm font-medium text-zinc-900">{m.name}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {m.ext.toUpperCase()} · {formatBytes(m.size)}
                  {m.width ? ` · ${m.width}×${m.height}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {formatDate(m.created_at)} ·{" "}
                  {m.used_in?.length ? `${m.used_in.length} playlist${m.used_in.length > 1 ? "s" : ""}` : "Unused"}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 rounded-full"
                    onClick={() => openAssign(m)}
                    data-testid={`assign-media-${m.id}`}
                  >
                    <MonitorPlay className="mr-1.5 h-3.5 w-3.5" /> Add to screen
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setRenaming(m);
                      setNewName(m.name);
                    }}
                    data-testid={`rename-media-${m.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => remove(m)}
                    data-testid={`delete-media-${m.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!assigning} onOpenChange={(v) => !v && setAssigning(null)}>
        <DialogContent data-testid="assign-media-dialog">
          <DialogHeader>
            <DialogTitle className="truncate">Add “{assigning?.name}” to which TV?</DialogTitle>
          </DialogHeader>
          {screens.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">You have no screens yet.</p>
          ) : (
            <div className="space-y-2" data-testid="assign-screen-list">
              {screens.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addToScreen(s)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left duration-200 hover:border-orange-300 hover:bg-orange-50"
                  data-testid={`assign-to-screen-${s.id}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-zinc-500">
                      {s.item_count} item{s.item_count === 1 ? "" : "s"} · {s.device?.name || "no Fire TV"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-orange-600">Add</span>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent data-testid="rename-media-dialog">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>File name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="rename-media-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={rename} disabled={!newName} data-testid="save-media-name">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-3xl" data-testid="media-preview-dialog">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="overflow-hidden rounded-xl bg-black">
              {preview.kind === "video" ? (
                <video src={mediaUrl(preview.id)} controls autoPlay className="max-h-[65vh] w-full" />
              ) : (
                <img src={mediaUrl(preview.id)} alt={preview.name} className="max-h-[65vh] w-full object-contain" />
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
