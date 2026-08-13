import { useEffect, useState } from "react";
import { Monitor, Plus, Tv, Unplug } from "lucide-react";
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

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [screens, setScreens] = useState([]);
  const [locations, setLocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", location_id: "", screen_id: "", name: "" });
  const [pairing, setPairing] = useState(false);
  const [playerApp, setPlayerApp] = useState(null);

  const load = () => {
    api.get("/devices").then((r) => setDevices(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/screens").then((r) => setScreens(r.data));
    api.get("/locations").then((r) => setLocations(r.data));
    api.get("/player-app").then((r) => setPlayerApp(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(() => api.get("/devices").then((r) => setDevices(r.data)).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  const pair = async () => {
    setPairing(true);
    try {
      const screen = screens.find((s) => s.id === form.screen_id);
      await api.post("/devices/pair", {
        code: form.code,
        screen_id: form.screen_id,
        name: form.name || `${screen?.name || "Fire"} TV`,
        ...(screen?.location_id ? { location_id: screen.location_id } : {}),
      });
      toast.success("Paired. Your television will start playing shortly.");
      setOpen(false);
      setForm({ code: "", location_id: "", screen_id: "", name: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPairing(false);
    }
  };

  const rename = async (device) => {
    const name = window.prompt("Device name", device.name);
    if (!name) return;
    try {
      await api.patch(`/devices/${device.id}`, { name });
      toast.success("Device renamed");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const reassign = async (device, screenId) => {
    try {
      await api.patch(`/devices/${device.id}`, { screen_id: screenId });
      toast.success("Device reassigned");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const unpair = async (device) => {
    if (!window.confirm(`Unpair "${device.name}"? The TV will need a new pairing code.`)) return;
    try {
      await api.delete(`/devices/${device.id}`);
      toast.success("Device unpaired");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const screensForLocation = screens;

  return (
    <AppShell>
      <PageHeader title="Devices" subtitle="Pair a Fire TV in seconds using the code shown on the television.">
        <Button
          className="rounded-full px-5"
          onClick={() => setOpen(true)}
          disabled={screens.length === 0}
          data-testid="pair-device-button"
        >
          <Plus className="mr-2 h-4 w-4" /> Pair New Device
        </Button>
      </PageHeader>

      <Card className="mb-8 border-zinc-200 bg-zinc-900 p-6 text-white shadow-sm im-grain">
        <p className="text-sm font-medium text-orange-400">How pairing works</p>
        <ol className="mt-3 grid gap-3 text-sm text-zinc-300 sm:grid-cols-3">
          <li>1. Open the InstaMenu app on the Fire TV. A 6-digit code appears.</li>
          <li>2. Click "Pair New Device" and type that code.</li>
          <li>3. Choose the screen it should display. Done — no remote typing.</li>
        </ol>
        {playerApp?.available ? (
          <div className="mt-5 border-t border-white/10 pt-4" data-testid="devices-install-link">
            <p className="text-sm text-zinc-400">
              New television? On the Fire TV open the <strong className="text-white">Downloader</strong> app and enter:
            </p>
            <code className="mt-2 block break-all font-mono text-base text-orange-300">
              {playerApp.download_url?.replace(/^https?:\/\//, "")}
            </code>
          </div>
        ) : null}
      </Card>

      {devices.length === 0 ? (
        <EmptyState
          icon={Tv}
          title="No devices paired"
          description="Launch the InstaMenu app on your Fire TV Stick and enter the code it shows here."
          actionLabel={screens.length ? "Pair New Device" : "Create a screen first"}
          onAction={() => (screens.length ? setOpen(true) : (window.location.href = "/screens"))}
          testId="devices-empty"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="devices-list">
          {devices.map((d) => (
            <Card key={d.id} className="border-zinc-200 p-6 shadow-sm" data-testid={`device-card-${d.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{d.name}</p>
                  <p className="mt-0.5 truncate text-sm text-zinc-500">{d.location_name || "No location"}</p>
                </div>
                <StatusDot online={d.online} />
              </div>
              <dl className="mt-6 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Screen</dt>
                  <dd className="truncate font-medium">{d.screen_name || "Unassigned"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">App version</dt>
                  <dd className="font-medium">{d.app_version || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Playlist version</dt>
                  <dd className="font-medium">{d.playlist_version ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Last seen</dt>
                  <dd className="font-medium">{timeAgo(d.last_seen)}</dd>
                </div>
              </dl>
              <div className="mt-6 space-y-2">
                <Select value={d.screen_id || undefined} onValueChange={(v) => reassign(d, v)}>
                  <SelectTrigger data-testid={`reassign-device-${d.id}`}>
                    <SelectValue placeholder="Assign to a screen" />
                  </SelectTrigger>
                  <SelectContent>
                    {screens.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={() => rename(d)}
                    data-testid={`rename-device-${d.id}`}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full text-red-600 hover:bg-red-50"
                    onClick={() => unpair(d)}
                    data-testid={`unpair-device-${d.id}`}
                  >
                    <Unplug className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="pair-device-dialog">
          <DialogHeader>
            <DialogTitle>Pair a new device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pairing code from the TV</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                placeholder="482917"
                className="h-16 text-center font-display text-3xl tracking-[0.4em]"
                data-testid="pair-code-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Which screen should it show?</Label>
              <Select value={form.screen_id} onValueChange={(v) => setForm({ ...form, screen_id: v })}>
                <SelectTrigger data-testid="pair-screen-select">
                  <SelectValue placeholder="Choose a screen" />
                </SelectTrigger>
                <SelectContent>
                  {screens.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {locations.length > 1 && s.location_name ? ` · ${s.location_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Device name <span className="font-normal text-zinc-400">(optional)</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Front Counter TV"
                data-testid="pair-name-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={pair}
              disabled={pairing || form.code.length !== 6 || !form.screen_id}
              data-testid="confirm-pair-button"
            >
              <Monitor className="mr-2 h-4 w-4" /> Connect this TV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
