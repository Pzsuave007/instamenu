import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Monitor, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { StatusDot } from "@/components/StatusDot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, apiError, timeAgo } from "@/lib/apiClient";
import { toast } from "sonner";

export default function Screens() {
  const [screens, setScreens] = useState([]);
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    location_id: "",
    orientation: "landscape",
    resolution: "1920x1080",
    image_fit: "fill",
    default_image_duration: 10,
  });

  const load = () => {
    api.get("/screens").then((r) => setScreens(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/locations").then((r) => setLocations(r.data));
  };

  useEffect(() => {
    load();
    const t = setInterval(() => api.get("/screens").then((r) => setScreens(r.data)).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  const create = async () => {
    try {
      await api.post("/screens", { ...form, default_image_duration: Number(form.default_image_duration) || 10 });
      toast.success("Screen created");
      setOpen(false);
      setForm({ ...form, name: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (screen) => {
    if (!window.confirm(`Delete screen "${screen.name}"?`)) return;
    try {
      await api.delete(`/screens/${screen.id}`);
      toast.success("Screen deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openNew = () => {
    setForm((f) => ({ ...f, location_id: locations[0]?.id || "" }));
    setOpen(true);
  };

  return (
    <AppShell>
      <PageHeader title="Screens" subtitle="One screen equals one television. Devices can be reassigned anytime.">
        <Button
          className="rounded-full px-5"
          onClick={openNew}
          disabled={locations.length === 0}
          data-testid="add-screen-button"
        >
          <Plus className="mr-2 h-4 w-4" /> Add Screen
        </Button>
      </PageHeader>

      {locations.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="Add a location first"
          description="Screens live inside a location, so create one location before adding screens."
          actionLabel="Go to Locations"
          onAction={() => (window.location.href = "/locations")}
          testId="screens-need-location"
        />
      ) : screens.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No screens yet"
          description="Create a screen for each television you want to control."
          actionLabel="Add Screen"
          onAction={openNew}
          testId="screens-empty"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="screens-list">
          {screens.map((s) => (
            <Card key={s.id} className="border-zinc-200 p-6 shadow-sm" data-testid={`screen-card-${s.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{s.name}</p>
                  <p className="mt-0.5 truncate text-sm text-zinc-500">{s.location_name}</p>
                </div>
                <StatusDot online={s.online} />
              </div>
              <dl className="mt-6 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Playlist</dt>
                  <dd className="truncate font-medium">{s.playlist_name || "Not assigned"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Device</dt>
                  <dd className="truncate font-medium">{s.device?.name || "Not paired"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Resolution</dt>
                  <dd className="font-medium">
                    {s.resolution} · {s.orientation}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Last seen</dt>
                  <dd className="font-medium">{timeAgo(s.last_seen)}</dd>
                </div>
              </dl>
              <div className="mt-6 flex gap-2">
                <Button asChild className="flex-1 rounded-full" data-testid={`open-screen-${s.id}`}>
                  <Link to={`/screens/${s.id}`}>Open & preview</Link>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => remove(s)}
                  data-testid={`delete-screen-${s.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="screen-dialog">
          <DialogHeader>
            <DialogTitle>New screen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Screen name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main Menu Left"
                data-testid="screen-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                <SelectTrigger data-testid="screen-location-select">
                  <SelectValue placeholder="Choose a location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Orientation</Label>
                <Select value={form.orientation} onValueChange={(v) => setForm({ ...form, orientation: v })}>
                  <SelectTrigger data-testid="screen-orientation-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="landscape">Landscape</SelectItem>
                    <SelectItem value="portrait">Portrait</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Resolution</Label>
                <Select value={form.resolution} onValueChange={(v) => setForm({ ...form, resolution: v })}>
                  <SelectTrigger data-testid="screen-resolution-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1920x1080">1920 × 1080</SelectItem>
                    <SelectItem value="3840x2160">3840 × 2160</SelectItem>
                    <SelectItem value="1280x720">1280 × 720</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Image fit</Label>
                <Select value={form.image_fit} onValueChange={(v) => setForm({ ...form, image_fit: v })}>
                  <SelectTrigger data-testid="screen-fit-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fit">Fit</SelectItem>
                    <SelectItem value="fill">Fill</SelectItem>
                    <SelectItem value="stretch">Stretch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default image duration (sec)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.default_image_duration}
                  onChange={(e) => setForm({ ...form, default_image_duration: e.target.value })}
                  data-testid="screen-duration-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={create}
              disabled={!form.name || !form.location_id}
              data-testid="save-screen"
            >
              Create screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
