import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { ArrowLeft, Film, FolderOpen, GripVertical, Loader2, Settings2, Trash2, Tv, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ScheduleCard } from "@/components/ScheduleCard";
import { StatusDot } from "@/components/StatusDot";
import { TvPreview } from "@/components/TvPreview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, apiError, mediaUrl } from "@/lib/apiClient";
import { toast } from "sonner";

export default function ScreenDetail() {
  const { screenId } = useParams();
  const [screen, setScreen] = useState(null);
  const [items, setItems] = useState([]);
  const [devices, setDevices] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [library, setLibrary] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const fileRef = useRef(null);

  const applyPlaylist = (playlist) =>
    setItems((playlist?.items || []).map((i) => ({ media_id: i.media_id, duration: i.duration, media: i.media })));

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/screens/${screenId}`);
      setScreen(data);
      applyPlaylist(data.playlist);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [screenId]);

  useEffect(() => {
    load();
    api.get("/devices").then((r) => setDevices(r.data));
    api.get("/media").then((r) => setLibrary(r.data)).catch(() => {});
    api.get("/playlists").then((r) => setPlaylists(r.data)).catch(() => {});
  }, [load]);

  const openLibrary = () => {
    setPicked([]);
    api.get("/media").then((r) => setLibrary(r.data)).catch(() => {});
    setLibraryOpen(true);
  };

  const togglePick = (id) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const addPicked = async () => {
    const chosen = picked
      .map((id) => library.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => ({ media_id: m.id, duration: m.kind === "video" ? 0 : 10, media: m }));
    setLibraryOpen(false);
    await persist([...items, ...chosen], `${chosen.length} added to this TV`);
  };

  const upload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    try {
      const { data } = await api.post(`/screens/${screenId}/content`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      applyPlaylist(data.playlist);
      if (data.added) toast.success(`${data.added} file${data.added > 1 ? "s" : ""} added to this TV`);
      data.errors?.forEach((err) => toast.error(err));
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setUploading(false);
    }
  };

  const persist = async (nextItems, message) => {
    setItems(nextItems);
    try {
      const { data } = await api.put(`/screens/${screenId}/content`, {
        items: nextItems.map((i) => ({ media_id: i.media_id, duration: i.duration || 10 })),
      });
      applyPlaylist(data);
      if (message) toast.success(message);
    } catch (e) {
      toast.error(apiError(e));
      load();
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = [...items];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    persist(next, "New order saved — TVs will update automatically");
  };

  const updateSetting = async (patch) => {
    try {
      await api.patch(`/screens/${screenId}`, patch);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const assignDevice = async (deviceId) => {
    try {
      await api.patch(`/devices/${deviceId}`, { screen_id: screenId });
      toast.success("Fire TV assigned to this screen");
      load();
      api.get("/devices").then((r) => setDevices(r.data));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (!screen) {
    return (
      <AppShell>
        <p className="text-sm text-zinc-500">Loading…</p>
      </AppShell>
    );
  }

  const unassigned = devices.filter((d) => !d.screen_id);

  return (
    <AppShell>
      <Link to="/screens" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> All screens
      </Link>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="screen-detail-name">
            {screen.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
            <StatusDot online={screen.online} />
            <span>·</span>
            <span>{screen.device ? screen.device.name : "No Fire TV paired yet"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.mp4"
            className="hidden"
            onChange={(e) => upload(e.target.files)}
            data-testid="screen-file-input"
          />
          <Button
            className="rounded-full px-5"
            onClick={openLibrary}
            data-testid="screen-choose-library-button"
          >
            <FolderOpen className="mr-2 h-4 w-4" /> Choose from library
          </Button>
          <Button
            variant="outline"
            className="rounded-full px-5"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            data-testid="screen-upload-button"
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload new"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => setShowSettings((s) => !s)}
            data-testid="screen-settings-toggle"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
        <Card className="border-zinc-200 p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">What this TV is playing</h2>
          <p className="mb-5 text-sm text-zinc-500">
            {items.length
              ? "Drag to change the order. Changes reach the TV within a minute."
              : "Drop your files below and they go straight on this TV."}
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              upload(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`mb-6 cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center duration-200 ${
              dragOver ? "border-orange-400 bg-orange-50" : "border-zinc-300 hover:border-orange-300"
            }`}
            data-testid="screen-dropzone"
          >
            <Upload className="mx-auto mb-3 h-6 w-6 text-orange-500" />
            <p className="text-sm font-medium text-zinc-800">Drag videos or images here</p>
            <p className="mt-1 text-xs text-zinc-500">
              Or click to upload · already uploaded? Use “Choose from library”
            </p>
          </div>

          {items.length > 0 ? (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="screen-content">
                {(dropProvided) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className="space-y-3"
                    data-testid="screen-content-items"
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
                            data-testid={`screen-content-item-${index}`}
                          >
                            <span
                              {...dragProvided.dragHandleProps}
                              className="cursor-grab text-zinc-400 hover:text-zinc-700"
                              data-testid={`screen-drag-handle-${index}`}
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
                                {item.media?.kind === "video" ? "Plays the whole video" : "Image"}
                              </p>
                            </div>
                            {item.media?.kind === "image" ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.duration}
                                  onChange={(e) =>
                                    setItems((prev) =>
                                      prev.map((it, i) =>
                                        i === index ? { ...it, duration: Number(e.target.value) || 0 } : it
                                      )
                                    )
                                  }
                                  onBlur={() => persist(items)}
                                  className="h-9 w-20"
                                  data-testid={`screen-item-duration-${index}`}
                                />
                                <span className="text-xs text-zinc-500">sec</span>
                              </div>
                            ) : null}
                            <button
                              className="text-zinc-400 duration-200 hover:text-red-500"
                              onClick={() => persist(items.filter((_, i) => i !== index), "Removed from this TV")}
                              data-testid={`screen-remove-item-${index}`}
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
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card className="border-zinc-200 p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold">How it looks on the TV</h2>
            <p className="mb-5 text-sm text-zinc-500">
              {screen.scheduled_now
                ? `Playing the scheduled menu “${screen.playlist?.name}” right now.`
                : "Exactly what the television plays, in order."}
            </p>
            <TvPreview
              items={items}
              imageFit={screen.image_fit}
              playlistName={`${items.length} item${items.length === 1 ? "" : "s"}`}
              testId="screen-detail-preview"
            />
          </Card>

          {!screen.device ? (
            <Card className="border-zinc-200 p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">Connect a television</h2>
              {unassigned.length ? (
                <>
                  <p className="mb-4 text-sm text-zinc-500">Pick a Fire TV you already paired.</p>
                  <Select onValueChange={assignDevice}>
                    <SelectTrigger data-testid="assign-device-select">
                      <SelectValue placeholder="Choose a Fire TV" />
                    </SelectTrigger>
                    <SelectContent>
                      {unassigned.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-zinc-500">
                    Open the InstaMenu app on your Fire TV and enter the code it shows.
                  </p>
                  <Button asChild className="w-full rounded-full" data-testid="screen-pair-cta">
                    <Link to="/devices">
                      <Tv className="mr-2 h-4 w-4" /> Pair a Fire TV
                    </Link>
                  </Button>
                </>
              )}
            </Card>
          ) : null}

          <ScheduleCard
            screen={screen}
            playlists={playlists}
            onChanged={load}
            onPlaylistCreated={(pl) => setPlaylists((prev) => [pl, ...prev])}
          />

          {showSettings ? (
            <Card className="border-zinc-200 p-6 shadow-sm" data-testid="screen-advanced-settings">
              <h2 className="mb-5 text-lg font-semibold">Advanced</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Image fit</Label>
                  <Select value={screen.image_fit} onValueChange={(v) => updateSetting({ image_fit: v })}>
                    <SelectTrigger data-testid="screen-detail-fit-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fill">Fill the screen</SelectItem>
                      <SelectItem value="fit">Fit inside (black bars)</SelectItem>
                      <SelectItem value="stretch">Stretch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Orientation</Label>
                  <Select value={screen.orientation} onValueChange={(v) => updateSetting({ orientation: v })}>
                    <SelectTrigger data-testid="screen-detail-orientation-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="landscape">Landscape</SelectItem>
                      <SelectItem value="portrait">Portrait</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-5 text-xs text-zinc-400" data-testid="screen-playlist-version">
                Playing playlist "{screen.playlist?.name}" · version {screen.playlist?.version ?? 1}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-3xl" data-testid="screen-library-dialog">
          <DialogHeader>
            <DialogTitle>Choose from your media library</DialogTitle>
          </DialogHeader>
          {library.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500" data-testid="screen-library-empty">
              Nothing in your library yet — upload a file first.
            </p>
          ) : (
            <div
              className="im-scroll grid max-h-[55vh] grid-cols-2 gap-4 overflow-y-auto pr-1 sm:grid-cols-3"
              data-testid="screen-library-grid"
            >
              {library.map((m) => {
                const isPicked = picked.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => togglePick(m.id)}
                    className={`overflow-hidden rounded-xl border-2 text-left duration-200 ${
                      isPicked ? "border-orange-500" : "border-zinc-200 hover:border-orange-300"
                    }`}
                    data-testid={`screen-library-item-${m.id}`}
                  >
                    <div className="relative aspect-video bg-zinc-900">
                      {m.kind === "video" ? (
                        <div className="flex h-full w-full items-center justify-center text-white/80">
                          <Film className="h-6 w-6" />
                        </div>
                      ) : (
                        <img src={mediaUrl(m.id)} alt={m.name} className="h-full w-full object-cover" />
                      )}
                      {isPicked ? (
                        <span className="absolute right-2 top-2 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-medium text-white">
                          {picked.indexOf(m.id) + 1}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate px-2.5 py-2 text-xs font-medium">{m.name}</p>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setLibraryOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={addPicked}
              disabled={picked.length === 0}
              data-testid="screen-library-add"
            >
              Add {picked.length ? `${picked.length} ` : ""}to this TV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
