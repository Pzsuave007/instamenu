import { useEffect, useState } from "react";
import { MapPin, Monitor, Plus, Trash2, Tv } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiError } from "@/lib/apiClient";
import { toast } from "sonner";

const blank = { name: "", address: "", city: "", state: "", timezone: "America/Los_Angeles" };

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/locations").then((r) => setLocations(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  };

  const openEdit = (loc) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      address: loc.address || "",
      city: loc.city || "",
      state: loc.state || "",
      timezone: loc.timezone || "America/Los_Angeles",
    });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await api.patch(`/locations/${editing.id}`, form);
      else await api.post("/locations", form);
      toast.success(editing ? "Location updated" : "Location created");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (loc) => {
    if (!window.confirm(`Delete "${loc.name}"?`)) return;
    try {
      await api.delete(`/locations/${loc.id}`);
      toast.success("Location deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <AppShell>
      <PageHeader title="Locations" subtitle="Each location has its own screens, devices and playlists.">
        <Button className="rounded-full px-5" onClick={openNew} data-testid="add-location-button">
          <Plus className="mr-2 h-4 w-4" /> Add Location
        </Button>
      </PageHeader>

      {locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Add your first location"
          description="A location is a physical restaurant address. You can add more later."
          actionLabel="Add Location"
          onAction={openNew}
          testId="locations-empty"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="locations-list">
          {locations.map((loc) => (
            <Card key={loc.id} className="border-zinc-200 p-6 shadow-sm" data-testid={`location-card-${loc.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{loc.name}</p>
                  <p className="mt-0.5 truncate text-sm text-zinc-500">
                    {[loc.address, loc.city, loc.state].filter(Boolean).join(", ") || "No address"}
                  </p>
                </div>
                <button
                  className="text-zinc-400 duration-200 hover:text-red-500"
                  onClick={() => remove(loc)}
                  data-testid={`delete-location-${loc.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-6 flex items-center gap-6 text-sm text-zinc-600">
                <span className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-zinc-400" /> {loc.screens} screens
                </span>
                <span className="flex items-center gap-2">
                  <Tv className="h-4 w-4 text-zinc-400" /> {loc.devices} devices
                </span>
              </div>
              <Button
                variant="outline"
                className="mt-6 w-full rounded-full"
                onClick={() => openEdit(loc)}
                data-testid={`edit-location-${loc.id}`}
              >
                Edit details
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="location-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit location" : "New location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Location name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Downtown Spokane"
                data-testid="location-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="212 W Main Ave"
                data-testid="location-address-input"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  data-testid="location-city-input"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  data-testid="location-state-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={save} disabled={saving || !form.name} data-testid="save-location">
              {editing ? "Save changes" : "Create location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
