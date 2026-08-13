import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HardDrive, Image, ListVideo, Monitor, Plus, Tv } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusDot } from "@/components/StatusDot";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, apiError, formatBytes, timeAgo } from "@/lib/apiClient";
import { toast } from "sonner";

const StatCard = ({ icon: Icon, label, value, hint, testId }) => (
  <Card className="border-zinc-200 p-6 shadow-sm" data-testid={testId}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-zinc-500">{label}</p>
        <p className="mt-2 font-display text-3xl font-semibold text-zinc-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-zinc-400">{hint}</p> : null}
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </Card>
);

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () =>
      api
        .get("/dashboard")
        .then((r) => setData(r.data))
        .catch((e) => toast.error(apiError(e)));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const stats = data?.stats;

  return (
    <AppShell>
      <PageHeader
        title={`Welcome back${data?.organization?.name ? `, ${data.organization.name}` : ""}`}
        subtitle="Here's what your televisions are doing right now."
      >
        <Button asChild className="rounded-full px-5" data-testid="add-screen-cta">
          <Link to="/screens">
            <Plus className="mr-2 h-4 w-4" /> Add Screen
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Monitor} label="Screens" value={stats?.screens ?? "—"} testId="stat-screens" />
        <StatCard
          icon={Tv}
          label="Devices Online"
          value={stats ? `${stats.devices_online} / ${stats.devices}` : "—"}
          testId="stat-devices"
        />
        <StatCard icon={ListVideo} label="Playlists" value={stats?.playlists ?? "—"} testId="stat-playlists" />
        <StatCard
          icon={Image}
          label="Media Files"
          value={stats?.media_files ?? "—"}
          hint={stats ? formatBytes(stats.storage_bytes) : null}
          testId="stat-media"
        />
      </div>

      <div className="mt-12">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">Your screens</h2>
          <Link to="/screens" className="text-sm font-medium text-orange-600 hover:text-orange-700">
            Manage screens
          </Link>
        </div>

        {data && data.screens.length === 0 ? (
          <EmptyState
            icon={Monitor}
            title="No screens yet"
            description="Create your first screen, then pair a Fire TV device to start showing your menu."
            actionLabel="Go to Screens"
            onAction={() => (window.location.href = "/screens")}
            testId="dashboard-empty-screens"
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-screens-list">
            {(data?.screens || []).map((s) => (
              <Link key={s.id} to={`/screens/${s.id}`} data-testid={`dashboard-screen-${s.id}`}>
                <Card className="group h-full border-zinc-200 p-6 shadow-sm duration-200 hover:border-orange-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold text-zinc-900">{s.name}</p>
                      <p className="mt-0.5 truncate text-sm text-zinc-500">{s.location_name}</p>
                    </div>
                    <StatusDot online={s.online} />
                  </div>
                  <dl className="mt-6 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Playlist</dt>
                      <dd className="truncate font-medium text-zinc-800">{s.playlist_name || "Not assigned"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Device</dt>
                      <dd className="truncate font-medium text-zinc-800">{s.device_name || "Not paired"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-zinc-500">Last seen</dt>
                      <dd className="font-medium text-zinc-800">{timeAgo(s.last_seen)}</dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {stats ? (
        <Card className="mt-10 flex flex-wrap items-center gap-6 border-zinc-200 p-6 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
            <HardDrive className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm text-zinc-500">Storage used</p>
            <p className="font-display text-xl font-semibold">{formatBytes(stats.storage_bytes)}</p>
          </div>
          <div className="hidden h-10 w-px bg-zinc-200 sm:block" />
          <div>
            <p className="text-sm text-zinc-500">Locations</p>
            <p className="font-display text-xl font-semibold">{stats.locations}</p>
          </div>
          <div className="hidden h-10 w-px bg-zinc-200 sm:block" />
          <div>
            <p className="text-sm text-zinc-500">Plan</p>
            <p className="font-display text-xl font-semibold capitalize">{data.organization?.plan || "trial"}</p>
          </div>
        </Card>
      ) : null}
    </AppShell>
  );
}
