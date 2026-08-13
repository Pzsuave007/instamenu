import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Monitor, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { StatusDot } from "@/components/StatusDot";
import { ScreenThumb } from "@/components/ScreenThumb";
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
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState({ name: "", location_id: "", image_fit: "fill" });

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
      const { data } = await api.post("/screens", {
        name: form.name,
        image_fit: form.image_fit,
        ...(form.location_id ? { location_id: form.location_id } : {}),
      });
      toast.success("Screen created — add your videos next");
      setOpen(false);
      setForm({ name: "", location_id: "", image_fit: "fill" });
      window.location.href = `/screens/${data.id}`;
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

  return (
    <AppShell>
      <PageHeader title="Screens" subtitle="One screen for each television. Open a screen to add or change its content.">
        <Button className="rounded-full px-5" onClick={() => setOpen(true)} data-testid="add-screen-button">
          <Plus className="mr-2 h-4 w-4" /> Add Screen
        </Button>
      </PageHeader>

      {screens.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="Add your first screen"
          description="Give it a name like “Main Menu Left”, then drop your videos onto it."
          actionLabel="Add Screen"
          onAction={() => setOpen(true)}
          testId="screens-empty"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="screens-list">
          {screens.map((s) => (
            <Card key={s.id} className="overflow-hidden border-zinc-200 shadow-sm" data-testid={`screen-card-${s.id}`}>
              <Link to={`/screens/${s.id}`} className="block aspect-video bg-zinc-900">
                <ScreenThumb mediaId={s.thumbnail_media_id} kind={s.thumbnail_kind} emptyLabel="No content yet" />
              </Link>
              <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-display text-lg font-semibold">{s.name}</p>
                  <StatusDot online={s.online} />
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {s.item_count ?? 0} item{(s.item_count ?? 0) === 1 ? "" : "s"} ·{" "}
                  {s.device?.name || "No Fire TV"} · seen {timeAgo(s.last_seen)}
                </p>
                <div className="mt-5 flex gap-2">
                  <Button asChild className="flex-1 rounded-full" data-testid={`open-screen-${s.id}`}>
                    <Link to={`/screens/${s.id}`}>Open</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full text-red-600 hover:bg-red-50"
                    onClick={() => remove(s)}
                    data-testid={`delete-screen-${s.id}`}
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
        <DialogContent data-testid="screen-dialog">
          <DialogHeader>
            <DialogTitle>Add a screen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What do you call this television?</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main Menu Left"
                onKeyDown={(e) => e.key === "Enter" && form.name && create()}
                data-testid="screen-name-input"
              />
              <p className="text-xs text-zinc-500">That's all we need — everything else can change later.</p>
            </div>

            <button
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
              onClick={() => setAdvanced((a) => !a)}
              data-testid="screen-advanced-toggle"
            >
              <ChevronDown className={`h-4 w-4 duration-200 ${advanced ? "rotate-180" : ""}`} /> Advanced options
            </button>

            {advanced ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {locations.length > 1 ? (
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
                ) : null}
                <div className="space-y-2">
                  <Label>Image fit</Label>
                  <Select value={form.image_fit} onValueChange={(v) => setForm({ ...form, image_fit: v })}>
                    <SelectTrigger data-testid="screen-fit-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fill">Fill the screen</SelectItem>
                      <SelectItem value="fit">Fit inside (black bars)</SelectItem>
                      <SelectItem value="stretch">Stretch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={create} disabled={!form.name} data-testid="save-screen">
              Create screen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
