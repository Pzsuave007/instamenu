import { useEffect, useRef, useState } from "react";
import { Copy, Upload } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusDot } from "@/components/StatusDot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, apiError, formatBytes, formatDate, timeAgo } from "@/lib/apiClient";
import { toast } from "sonner";

const DEVICE_ENDPOINTS = [
  ["POST", "/api/device/pair/request", "TV requests a 6-digit pairing code"],
  ["GET", "/api/device/pair/status", "TV polls until the dashboard claims the code"],
  ["GET", "/api/device/config", "Screen settings + current playlist version"],
  ["GET", "/api/device/playlist", "Full manifest with media URLs for caching"],
  ["POST", "/api/device/heartbeat", "Liveness + reports the playing playlist version"],
];

export default function AdminSystem() {
  const [devices, setDevices] = useState([]);
  const [apk, setApk] = useState(null);
  const [version, setVersion] = useState("1.0.0");
  const [uploading, setUploading] = useState(false);
  const apkRef = useRef(null);

  const loadApk = () => api.get("/admin/player-apk").then((r) => setApk(r.data)).catch(() => {});

  const uploadApk = async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("version", version || "1.0.0");
    try {
      await api.post("/admin/player-apk", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Player app uploaded — televisions can install it from the link below");
      loadApk();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    api.get("/admin/devices").then((r) => setDevices(r.data)).catch((e) => toast.error(apiError(e)));
    loadApk();
  }, []);

  return (
    <AppShell>
      <PageHeader title="System" subtitle="Connected display devices and the player API contract." />

        <Card className="mb-8 border-zinc-200 p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">Fire TV player app</h2>
          <p className="mb-5 text-sm text-zinc-500">
            Upload the APK once and every television installs it from one short link — no GitHub, Drive or cables.
          </p>

          <div className="grid gap-4 sm:grid-cols-[1fr,auto] sm:items-end">
            <div className="space-y-2">
              <Label>Version label</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                data-testid="apk-version-input"
              />
            </div>
            <div className="flex gap-2">
              <input
                ref={apkRef}
                type="file"
                accept=".apk"
                className="hidden"
                onChange={(e) => uploadApk(e.target.files?.[0])}
                data-testid="apk-file-input"
              />
              <Button
                className="rounded-full px-5"
                onClick={() => apkRef.current?.click()}
                disabled={uploading}
                data-testid="upload-apk-button"
              >
                <Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading…" : "Upload APK"}
              </Button>
            </div>
          </div>

          {apk?.available ? (
            <div className="mt-6 rounded-xl bg-zinc-900 p-5 text-white" data-testid="apk-install-link">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">Type this on the TV</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="break-all font-mono text-lg">{apk.download_url?.replace(/^https?:\/\//, "")}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    navigator.clipboard?.writeText(apk.download_url);
                    toast.success("Link copied");
                  }}
                  data-testid="copy-apk-link"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </Button>
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                On the Fire TV: enable <strong>Apps from Unknown Sources</strong>, open the free{" "}
                <strong>Downloader</strong> app, enter that address and press Go.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Version {apk.version} · {formatBytes(apk.size)} · uploaded {formatDate(apk.uploaded_at)}
              </p>
            </div>
          ) : (
            <p className="mt-6 text-sm text-zinc-500" data-testid="apk-missing">
              No APK uploaded yet. Build it from the GitHub Actions workflow, then upload it here once.
            </p>
          )}
        </Card>

        <Card className="mb-8 overflow-hidden border-zinc-200 shadow-sm">
        <div className="border-b border-zinc-100 p-6">
          <h2 className="text-lg font-semibold">Connected devices</h2>
        </div>
        <div className="overflow-x-auto">
          <Table data-testid="admin-devices-table">
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Screen</TableHead>
                <TableHead>App</TableHead>
                <TableHead>Playlist v</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.id} className="hover:bg-zinc-50">
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.organization_name || "—"}</TableCell>
                  <TableCell>{d.screen_name || "Unassigned"}</TableCell>
                  <TableCell>{d.app_version || "—"}</TableCell>
                  <TableCell>{d.playlist_version ?? "—"}</TableCell>
                  <TableCell>{timeAgo(d.last_seen)}</TableCell>
                  <TableCell>
                    <StatusDot online={d.online} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="border-zinc-200 p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Display device API</h2>
        <p className="mb-5 text-sm text-zinc-500">
          The Fire TV player only needs these endpoints. All authentication uses a persistent device token, never a user
          password.
        </p>
        <div className="divide-y divide-zinc-100" data-testid="device-api-list">
          {DEVICE_ENDPOINTS.map(([method, path, note]) => (
            <div key={path} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-xs text-white">{method}</span>
              <code className="font-mono text-zinc-800">{path}</code>
              <span className="text-zinc-500">{note}</span>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
