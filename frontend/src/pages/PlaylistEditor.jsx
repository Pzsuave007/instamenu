import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { ArrowLeft, Film, GripVertical, Image as ImageIcon, Plus, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TvPreview } from "@/components/TvPreview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiError, formatBytes, mediaUrl } from "@/lib/apiClient";
import { toast } from "sonner";

export default function PlaylistEditor() {
  const { playlistId } = useParams();
  const [playlist, setPlaylist] = useState(null);
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [media, setMedia] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/playlists/${playlistId}`);
      setPlaylist(data);
      setName(data.name);
      setItems(data.items.map((i) => ({ media_id: i.media_id, duration: i.duration, media: i.media })));
      setDirty(false);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [playlistId]);

  useEffect(() => {
    load();
    api.get("/media").then((r) => setMedia(r.data));
  }, [load]);

  const addItem = (m) => {
    setItems((prev) => [...prev, { media_id: m.id, duration: m.kind === "video" ? 0 : 10, media: m }]);
    setDirty(true);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const setDuration = (index, value) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, duration: Number(value) || 0 } : it)));
    setDirty(true);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(result.source.index, 1);
      next.splice(result.destination.index, 0, moved);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/playlists/${playlistId}`, {
        name,
        items: items.map((i) => ({ media_id: i.media_id, duration: i.duration || 10 })),
      });
      setPlaylist(data);
      setDirty(false);
      toast.success(`Saved — playlist version ${data.version}. Televisions will update automatically.`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (!playlist) {
    return (
      <AppShell>
        <p className="text-sm text-zinc-500">Loading playlist…</p>
      </AppShell>
    );
  }

  const totalDuration = items.reduce((sum, i) => sum + (i.media?.kind === "video" ? 0 : i.duration || 0), 0);

  return (
    <AppShell>
      <Link to="/playlists" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to playlists
      </Link>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-md flex-1">
          <Label className="text-xs uppercase tracking-wide text-zinc-400">Playlist name</Label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="mt-2 h-12 border-0 border-b border-zinc-200 px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
            data-testid="playlist-editor-name"
          />
          <p className="mt-2 text-sm text-zinc-500" data-testid="playlist-editor-meta">
            {items.length} items · {totalDuration}s of images · version {playlist.version}
          </p>
        </div>
        <Button
          className="rounded-full px-6"
          onClick={save}
          disabled={!dirty || saving}
          data-testid="save-playlist-button"
        >
          <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.15fr,1fr]">
        <Card className="border-zinc-200 p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold">Playlist order</h2>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-sm text-zinc-500">
              Add media from the library on the right to build your loop.
            </div>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="playlist-items">
                {(dropProvided) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className="space-y-3"
                    data-testid="playlist-items"
                  >
                    {items.map((item, index) => (
                      <Draggable key={`${item.media_id}-${index}`} draggableId={`${item.media_id}-${index}`} index={index}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`flex items-center gap-4 rounded-xl border bg-white p-3 ${
                              snapshot.isDragging ? "border-orange-300 shadow-lg" : "border-zinc-200"
                            }`}
                            data-testid={`playlist-item-${index}`}
                          >
                            <span
                              {...dragProvided.dragHandleProps}
                              className="cursor-grab text-zinc-400 hover:text-zinc-700"
                              data-testid={`drag-handle-${index}`}
                            >
                              <GripVertical className="h-5 w-5" />
                            </span>
                            <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                              {item.media?.kind === "video" ? (
                                <div className="flex h-full w-full items-center justify-center text-white/80">
                                  <Film className="h-5 w-5" />
                                </div>
                              ) : (
                                <img src={mediaUrl(item.media_id)} alt="" className="h-full w-full object-cover" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{item.media?.name}</p>
                              <p className="text-xs text-zinc-500">
                                {item.media?.kind === "video" ? "Plays full video length" : "Image"}
                              </p>
                            </div>
                            {item.media?.kind === "image" ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.duration}
                                  onChange={(e) => setDuration(index, e.target.value)}
                                  className="h-9 w-20"
                                  data-testid={`item-duration-${index}`}
                                />
                                <span className="text-xs text-zinc-500">sec</span>
                              </div>
                            ) : null}
                            <button
                              className="text-zinc-400 duration-200 hover:text-red-500"
                              onClick={() => removeItem(index)}
                              data-testid={`remove-item-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {dropProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </Card>

        <div className="space-y-8">
          <Card className="border-zinc-200 p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-semibold">Preview</h2>
            <TvPreview items={items.map((i) => ({ ...i, media: i.media }))} imageFit="fill" playlistName={name} />
          </Card>

          <Card className="border-zinc-200 p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Media library</h2>
              <Link to="/media" className="text-sm font-medium text-orange-600 hover:text-orange-700">
                Upload
              </Link>
            </div>
            {media.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No media yet. <Link to="/media" className="text-orange-600">Upload files</Link> first.
              </p>
            ) : (
              <div className="im-scroll grid max-h-96 grid-cols-2 gap-4 overflow-y-auto pr-1" data-testid="media-picker">
                {media.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => addItem(m)}
                    className="group relative overflow-hidden rounded-xl border border-zinc-200 text-left duration-200 hover:border-orange-300"
                    data-testid={`add-media-${m.id}`}
                  >
                    <div className="aspect-video bg-zinc-900">
                      {m.kind === "video" ? (
                        <div className="flex h-full w-full items-center justify-center text-white/80">
                          <Film className="h-6 w-6" />
                        </div>
                      ) : (
                        <img
                          src={mediaUrl(m.id)}
                          alt={m.name}
                          className="h-full w-full object-cover duration-300 group-hover:scale-105"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2 p-2.5">
                      {m.kind === "video" ? (
                        <Film className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{m.name}</span>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                    </div>
                    <p className="px-2.5 pb-2.5 text-[11px] text-zinc-400">{formatBytes(m.size)}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
