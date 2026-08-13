import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Tv } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusDot } from "@/components/StatusDot";
import { TvPreview } from "@/components/TvPreview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, apiError, timeAgo } from "@/lib/apiClient";
import { toast } from "sonner";

const NONE = "__none__";

export default function ScreenDetail() {
  const { screenId } = useParams();
  const [screen, setScreen] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [devices, setDevices] = useState([]);

  const load = useCallback(() => {
    api
      .get(`/screens/${screenId}`)
      .then((r) => setScreen(r.data))
      .catch((e) => toast.error(apiError(e)));
  }, [screenId]);

  useEffect(() => {
    load();
    api.get("/playlists").then((r) => setPlaylists(r.data));
    api.get("/devices").then((r) => setDevices(r.data));
  }, [load]);

  const assignPlaylist = async (value) => {
    try {
      await api.patch(`/screens/${screenId}`, { playlist_id: value === NONE ? null : value });
      toast.success("Playlist assigned — televisions will update automatically");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const assignDevice = async (deviceId) => {
    try {
      await api.patch(`/devices/${deviceId}`, { screen_id: screenId });
      toast.success("Device assigned to this screen");
      load();
      api.get("/devices").then((r) => setDevices(r.data));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const updateSetting = async (patch) => {
    try {
      await api.patch(`/screens/${screenId}`, patch);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (!screen) {
    return (
      <AppShell>
        <p className="text-sm text-zinc-500">Loading screen…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link to="/screens" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to screens
      </Link>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="screen-detail-name">
            {screen.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {screen.location_name} · {screen.resolution} · {screen.orientation}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <StatusDot online={screen.online} />
          <span className="text-sm text-zinc-500">Last seen {timeAgo(screen.last_seen)}</span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.35fr,1fr]">
        <Card className="border-zinc-200 p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold">Live preview</h2>
          <TvPreview
            items={screen.playlist?.items || []}
            imageFit={screen.image_fit}
            playlistName={screen.playlist?.name}
            testId="screen-detail-preview"
          />
        </Card>

        <div className="space-y-6">
          <Card className="border-zinc-200 p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-semibold">Content</h2>
            <div className="space-y-2">
              <Label>Assigned playlist</Label>
              <Select value={screen.playlist_id || NONE} onValueChange={assignPlaylist}>
                <SelectTrigger data-testid="assign-playlist-select">
                  <SelectValue placeholder="Choose a playlist" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No playlist</SelectItem>
                  {playlists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.item_count} items)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {screen.playlist ? (
              <p className="mt-4 text-xs text-zinc-500" data-testid="screen-playlist-version">
                Playlist version {screen.playlist.version} · {screen.playlist.item_count} items ·{" "}
                {screen.playlist.total_duration}s loop
              </p>
            ) : null}
          </Card>

          <Card className="border-zinc-200 p-6 shadow-sm">
            <h2 className="mb-5 text-lg font-semibold">Display settings</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Image fit</Label>
                <Select value={screen.image_fit} onValueChange={(v) => updateSetting({ image_fit: v })}>
                  <SelectTrigger data-testid="screen-detail-fit-select">
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
          </Card>

          <Card className="border-zinc-200 p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Paired device</h2>
            {screen.device ? (
              <div className="flex items-center gap-3" data-testid="screen-paired-device">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                  <Tv className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">{screen.device.name}</p>
                  <p className="text-xs text-zinc-500">
                    {screen.device.model || "Fire TV"} · app {screen.device.app_version || "—"}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-zinc-500">No device is showing this screen yet.</p>
                {devices.filter((d) => !d.screen_id).length > 0 ? (
                  <Select onValueChange={assignDevice}>
                    <SelectTrigger data-testid="assign-device-select">
                      <SelectValue placeholder="Assign an unassigned device" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices
                        .filter((d) => !d.screen_id)
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button asChild variant="outline" className="w-full rounded-full">
                    <Link to="/devices">Pair a Fire TV device</Link>
                  </Button>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
