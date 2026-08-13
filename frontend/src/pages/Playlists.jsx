import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, ListVideo, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiError, mediaUrl } from "@/lib/apiClient";
import { toast } from "sonner";

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const load = () => api.get("/playlists").then((r) => setPlaylists(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      await api.post("/playlists", { name, items: [] });
      toast.success("Playlist created");
      setOpen(false);
      setName("");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const duplicate = async (pl) => {
    try {
      await api.post(`/playlists/${pl.id}/duplicate`);
      toast.success("Playlist duplicated");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (pl) => {
    try {
      await api.delete(`/playlists/${pl.id}`);
      toast.success("Playlist deleted");
      load();
    } catch (e) {
      const msg = apiError(e);
      if (e?.response?.status === 409 && window.confirm(`${msg}\n\nDelete it anyway?`)) {
        await api.delete(`/playlists/${pl.id}?force=true`);
        toast.success("Playlist deleted");
        load();
      } else {
        toast.error(msg);
      }
    }
  };

  return (
    <AppShell>
      <PageHeader title="Playlists" subtitle="Order your images and videos, then assign a playlist to any screen.">
        <Button className="rounded-full px-5" onClick={() => setOpen(true)} data-testid="add-playlist-button">
          <Plus className="mr-2 h-4 w-4" /> New Playlist
        </Button>
      </PageHeader>

      {playlists.length === 0 ? (
        <EmptyState
          icon={ListVideo}
          title="No playlists yet"
          description="A playlist is the loop of content your television plays. Create one to get started."
          actionLabel="New Playlist"
          onAction={() => setOpen(true)}
          testId="playlists-empty"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="playlists-list">
          {playlists.map((pl) => (
            <Card key={pl.id} className="overflow-hidden border-zinc-200 shadow-sm" data-testid={`playlist-card-${pl.id}`}>
              <Link to={`/playlists/${pl.id}`} className="block aspect-video bg-zinc-900">
                {pl.thumbnail_media_id ? (
                  <img
                    src={mediaUrl(pl.thumbnail_media_id)}
                    alt={pl.name}
                    className="h-full w-full object-cover duration-300 hover:opacity-90"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-600">
                    <ListVideo className="h-8 w-8" />
                  </div>
                )}
              </Link>
              <div className="p-6">
                <p className="truncate font-display text-lg font-semibold">{pl.name}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {pl.item_count} items · {pl.total_duration}s loop · v{pl.version}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {pl.assigned_screens ? `On ${pl.assigned_screens} screen(s)` : "Not assigned to a screen"}
                </p>
                <div className="mt-5 flex gap-2">
                  <Button asChild className="flex-1 rounded-full" data-testid={`edit-playlist-${pl.id}`}>
                    <Link to={`/playlists/${pl.id}`}>Edit</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() => duplicate(pl)}
                    data-testid={`duplicate-playlist-${pl.id}`}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full text-red-600 hover:bg-red-50"
                    onClick={() => remove(pl)}
                    data-testid={`delete-playlist-${pl.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="playlist-dialog">
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Playlist name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dinner Menu"
              data-testid="playlist-name-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={create} disabled={!name} data-testid="save-playlist">
              Create playlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
