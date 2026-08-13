import { useEffect, useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, apiError } from "@/lib/apiClient";
import { toast } from "sonner";

const NO_ORG = "__none__";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "owner", org_id: "" });

  const load = () => api.get("/admin/users").then((r) => setUsers(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
    api.get("/admin/organizations").then((r) => setOrgs(r.data));
  }, []);

  const create = async () => {
    try {
      await api.post("/admin/users", {
        ...form,
        org_id: form.role === "super_admin" ? null : form.org_id || null,
      });
      toast.success("User created");
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "owner", org_id: "" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const resetPassword = async (user) => {
    const password = window.prompt(`New password for ${user.email}`);
    if (!password) return;
    try {
      await api.post(`/admin/users/${user.id}/reset-password`, { password });
      toast.success("Password reset");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/admin/users/${user.id}`, { is_active: !(user.is_active !== false) });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (user) => {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <AppShell>
      <PageHeader title="Users" subtitle="All platform and restaurant logins.">
        <Button className="rounded-full px-5" onClick={() => setOpen(true)} data-testid="add-user-button">
          <Plus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </PageHeader>

      <Card className="overflow-hidden border-zinc-200 shadow-sm">
        <div className="overflow-x-auto">
          <Table data-testid="admin-users-table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Restaurant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="hover:bg-zinc-50" data-testid={`admin-user-row-${u.id}`}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="capitalize">{u.role.replace("_", " ")}</TableCell>
                  <TableCell>{u.organization_name || "—"}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleActive(u)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        u.is_active !== false ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                      data-testid={`toggle-user-${u.id}`}
                    >
                      {u.is_active !== false ? "active" : "disabled"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => resetPassword(u)}
                        data-testid={`reset-password-${u.id}`}
                      >
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Reset
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full text-red-600 hover:bg-red-50"
                        onClick={() => remove(u)}
                        data-testid={`delete-user-${u.id}`}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="admin-user-dialog">
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="user-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="user-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                data-testid="user-password-input"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Restaurant Owner</SelectItem>
                    <SelectItem value="manager">Restaurant Manager</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Restaurant</Label>
                <Select
                  value={form.org_id || NO_ORG}
                  onValueChange={(v) => setForm({ ...form, org_id: v === NO_ORG ? "" : v })}
                  disabled={form.role === "super_admin"}
                >
                  <SelectTrigger data-testid="user-org-select">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ORG}>None</SelectItem>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={create}
              disabled={!form.name || !form.email || form.password.length < 6}
              data-testid="save-user"
            >
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
