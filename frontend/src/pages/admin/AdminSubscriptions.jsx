import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, apiError } from "@/lib/apiClient";
import { toast } from "sonner";

const PLANS = ["trial", "starter", "pro"];

export default function AdminSubscriptions() {
  const [orgs, setOrgs] = useState([]);

  const load = () =>
    api.get("/admin/organizations").then((r) => setOrgs(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const setPlan = async (org, plan) => {
    try {
      await api.patch(`/admin/organizations/${org.id}`, { plan });
      toast.success(`${org.name} moved to ${plan}`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Subscriptions"
        subtitle="Plan assignment today; billing provider integration can be added on top of this."
      />

      <Card className="overflow-hidden border-zinc-200 shadow-sm">
        <div className="overflow-x-auto">
          <Table data-testid="admin-subscriptions-table">
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Screens</TableHead>
                <TableHead>Devices</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id} className="hover:bg-zinc-50">
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>{org.screens}</TableCell>
                  <TableCell>{org.devices}</TableCell>
                  <TableCell className="capitalize">{org.subscription?.status || org.status}</TableCell>
                  <TableCell className="w-48">
                    <Select value={org.plan} onValueChange={(v) => setPlan(org, v)}>
                      <SelectTrigger data-testid={`plan-select-${org.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLANS.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AppShell>
  );
}
