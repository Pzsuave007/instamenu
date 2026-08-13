import { useEffect, useState } from "react";
import { Building2, HardDrive, MapPin, Monitor, Tv, Users } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { api, apiError, formatBytes } from "@/lib/apiClient";
import { toast } from "sonner";

const Stat = ({ icon: Icon, label, value, hint, testId }) => (
  <Card className="border-zinc-200 p-6 shadow-sm" data-testid={testId}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-zinc-500">{label}</p>
        <p className="mt-2 font-display text-3xl font-semibold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-zinc-400">{hint}</p> : null}
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </Card>
);

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get("/admin/overview").then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/admin/audit-logs").then((r) => setLogs(r.data)).catch(() => {});
  }, []);

  return (
    <AppShell>
      <PageHeader title="Platform overview" subtitle="Every restaurant, screen and device on InstaMenu." />

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          icon={Building2}
          label="Restaurants"
          value={data?.organizations ?? "—"}
          hint={data ? `${data.active_organizations} active` : null}
          testId="admin-stat-orgs"
        />
        <Stat icon={MapPin} label="Locations" value={data?.locations ?? "—"} testId="admin-stat-locations" />
        <Stat icon={Monitor} label="Screens" value={data?.screens ?? "—"} testId="admin-stat-screens" />
        <Stat
          icon={Tv}
          label="Devices online"
          value={data ? `${data.devices_online} / ${data.devices}` : "—"}
          testId="admin-stat-devices"
        />
        <Stat icon={Users} label="Users" value={data?.users ?? "—"} testId="admin-stat-users" />
        <Stat
          icon={HardDrive}
          label="Media storage"
          value={data ? formatBytes(data.storage_bytes) : "—"}
          hint={data ? `${data.media_files} files` : null}
          testId="admin-stat-storage"
        />
      </div>

      <Card className="mt-10 border-zinc-200 p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Recent activity</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity recorded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100" data-testid="admin-audit-logs">
            {logs.slice(0, 20).map((log, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="font-medium text-zinc-800">{log.action}</span>
                <span className="text-xs text-zinc-400">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
