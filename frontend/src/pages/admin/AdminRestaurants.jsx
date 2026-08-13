import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, LogIn, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { api, apiError, formatBytes } from "@/lib/apiClient";
import { toast } from "sonner";

export default function AdminRestaurants() {
  const { impersonate } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact_email: "", phone: "", plan: "trial" });
  const [ownerForm, setOwnerForm] = useState({ name: "", email: "", password: "" });

  const load = () =>
    api.get("/admin/organizations").then((r) => setOrgs(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      const { data: org } = await api.post("/admin/organizations", form);
      if (ownerForm.email && ownerForm.password) {
        await api.post("/admin/users", { ...ownerForm, role: "owner", org_id: org.id });
      }
      toast.success("Restaurant created");
      setOpen(false);
      setForm({ name: "", contact_email: "", phone: "", plan: "trial" });
      setOwnerForm({ name: "", email: "", password: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleStatus = async (org) => {
    try {
      await api.patch(`/admin/organizations/${org.id}`, { status: org.status === "active" ? "disabled" : "active" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (org) => {
    if (!window.confirm(`Permanently delete "${org.name}" and all its data?`)) return;
    try {
      await api.delete(`/admin/organizations/${org.id}`);
      toast.success("Restaurant deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const support = async (org) => {
    try {
      await impersonate(org.id);
      navigate("/dashboard");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <AppShell>
      <PageHeader title="Restaurants" subtitle="Create accounts, manage status and jump in for support.">
        <Button className="rounded-full px-5" onClick={() => setOpen(true)} data-testid="add-restaurant-button">
          <Plus className="mr-2 h-4 w-4" /> Add Restaurant
        </Button>
      </PageHeader>

      {orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No restaurants yet"
          description="Create the first restaurant account and its owner login."
          actionLabel="Add Restaurant"
          onAction={() => setOpen(true)}
          testId="admin-orgs-empty"
        />
      ) : (
        <Card className="overflow-hidden border-zinc-200 shadow-sm">
          <div className="overflow-x-auto">
            <Table data-testid="admin-orgs-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead>Screens</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id} className="hover:bg-zinc-50" data-testid={`admin-org-row-${org.id}`}>
                    <TableCell>
                      <p className="font-medium text-zinc-900">{org.name}</p>
                      <p className="text-xs text-zinc-500">{org.contact_email || "—"}</p>
                    </TableCell>
                    <TableCell className="capitalize">{org.plan}</TableCell>
                    <TableCell>{org.locations}</TableCell>
                    <TableCell>{org.screens}</TableCell>
                    <TableCell>
                      {org.devices_online} / {org.devices}
                    </TableCell>
                    <TableCell>{formatBytes(org.storage_bytes)}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleStatus(org)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          org.status === "active" ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                        }`}
                        data-testid={`toggle-org-status-${org.id}`}
                      >
                        {org.status}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => support(org)}
                          data-testid={`impersonate-org-${org.id}`}
                        >
                          <LogIn className="mr-1.5 h-3.5 w-3.5" /> Support
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-full text-red-600 hover:bg-red-50"
                          onClick={() => remove(org)}
                          data-testid={`delete-org-${org.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="admin-org-dialog">
          <DialogHeader>
            <DialogTitle>New restaurant account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Restaurant name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Casa Lola Kitchen"
                data-testid="org-name-input"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Contact email</Label>
                <Input
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  data-testid="org-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                  <SelectTrigger data-testid="org-plan-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 p-4">
              <p className="mb-3 text-sm font-medium">Owner login (optional)</p>
              <div className="space-y-3">
                <Input
                  placeholder="Owner name"
                  value={ownerForm.name}
                  onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })}
                  data-testid="org-owner-name-input"
                />
                <Input
                  placeholder="owner@restaurant.com"
                  value={ownerForm.email}
                  onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })}
                  data-testid="org-owner-email-input"
                />
                <Input
                  placeholder="Temporary password"
                  value={ownerForm.password}
                  onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })}
                  data-testid="org-owner-password-input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={create} disabled={!form.name} data-testid="save-org">
              Create restaurant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
