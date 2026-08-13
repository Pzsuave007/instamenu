import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/StatusDot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, apiError, timeAgo } from "@/lib/apiClient";
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

  useEffect(() => {
    api.get("/admin/devices").then((r) => setDevices(r.data)).catch((e) => toast.error(apiError(e)));
  }, []);

  return (
    <AppShell>
      <PageHeader title="System" subtitle="Connected display devices and the player API contract." />

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
