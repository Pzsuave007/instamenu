import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Image, Monitor, Plus, Tv } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatusDot } from "@/components/StatusDot";
import { ScreenThumb } from "@/components/ScreenThumb";
import { RestaurantShowroom } from "@/components/RestaurantShowroom";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, apiError, formatBytes, timeAgo } from "@/lib/apiClient";
import { toast } from "sonner";

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
        subtitle="Click any television to change what it's showing."
      >
        <Button asChild className="rounded-full px-5" data-testid="add-screen-cta">
          <Link to="/screens">
            <Plus className="mr-2 h-4 w-4" /> Add Screen
          </Link>
        </Button>
      </PageHeader>

      {data && data.screens.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="Let's get your first TV running"
          description="Add a screen, drop in your videos, then pair your Fire TV stick. Three steps, that's it."
          actionLabel="Add Screen"
          onAction={() => (window.location.href = "/screens")}
          testId="dashboard-empty-screens"
        />
      ) : (
        <>
          <RestaurantShowroom screens={data?.screens || []} />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-screens-list">
          {(data?.screens || []).map((s) => (
            <Link key={s.id} to={`/screens/${s.id}`} data-testid={`dashboard-screen-${s.id}`}>
              <Card className="group h-full overflow-hidden border-zinc-200 shadow-sm duration-200 hover:border-orange-300 hover:shadow-md">
                <div className="relative aspect-video bg-zinc-900">
                  <ScreenThumb mediaId={s.thumbnail_media_id} kind={s.thumbnail_kind} />
                  <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur">
                    <StatusDot online={s.online} />
                  </span>
                </div>
                <div className="p-6">
                  <p className="truncate font-display text-lg font-semibold text-zinc-900">{s.name}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {s.item_count} item{s.item_count === 1 ? "" : "s"} · {s.device_name || "No Fire TV paired"}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">Last seen {timeAgo(s.last_seen)}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
        </>
      )}

      {stats ? (
        <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl border border-zinc-200 bg-white p-6 text-sm shadow-sm">
          <span className="flex items-center gap-2 text-zinc-600" data-testid="stat-devices">
            <Tv className="h-4 w-4 text-zinc-400" />
            {stats.devices_online} of {stats.devices} Fire TVs online
          </span>
          <span className="flex items-center gap-2 text-zinc-600" data-testid="stat-screens">
            <Monitor className="h-4 w-4 text-zinc-400" />
            {stats.screens} screens
          </span>
          <span className="flex items-center gap-2 text-zinc-600" data-testid="stat-media">
            <Image className="h-4 w-4 text-zinc-400" />
            {stats.media_files} files · {formatBytes(stats.storage_bytes)}
          </span>
          <Link to="/media" className="ml-auto font-medium text-orange-600 hover:text-orange-700">
            Open media library
          </Link>
        </div>
      ) : null}
    </AppShell>
  );
}
