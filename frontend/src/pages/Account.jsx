import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/apiClient";
import { toast } from "sonner";

export default function Account() {
  const { user, refresh } = useAuth();
  const [org, setOrg] = useState({ name: "", contact_email: "", phone: "" });
  const [team, setTeam] = useState([]);
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", password: "", role: "manager" });

  const loadTeam = () => api.get("/team").then((r) => setTeam(r.data)).catch(() => {});

  useEffect(() => {
    api.get("/organization").then((r) =>
      setOrg({ name: r.data.name || "", contact_email: r.data.contact_email || "", phone: r.data.phone || "" })
    );
    loadTeam();
  }, []);

  const saveOrg = async () => {
    try {
      await api.patch("/organization", org);
      toast.success("Restaurant details updated");
      refresh();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const changePassword = async () => {
    try {
      await api.post("/auth/change-password", { password });
      setPassword("");
      toast.success("Password updated");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const addMember = async () => {
    try {
      await api.post("/team", invite);
      toast.success("Team member added");
      setOpen(false);
      setInvite({ name: "", email: "", password: "", role: "manager" });
      loadTeam();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const removeMember = async (member) => {
    if (!window.confirm(`Remove ${member.name}?`)) return;
    try {
      await api.delete(`/team/${member.id}`);
      loadTeam();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <AppShell>
      <PageHeader title="Account" subtitle="Restaurant details, your login and your team." />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="border-zinc-200 p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold">Restaurant details</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Restaurant name</Label>
              <Input
                value={org.name}
                onChange={(e) => setOrg({ ...org, name: e.target.value })}
                data-testid="account-org-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Contact email</Label>
              <Input
                value={org.contact_email}
                onChange={(e) => setOrg({ ...org, contact_email: e.target.value })}
                data-testid="account-org-email"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={org.phone}
                onChange={(e) => setOrg({ ...org, phone: e.target.value })}
                data-testid="account-org-phone"
              />
            </div>
            <Button className="rounded-full" onClick={saveOrg} data-testid="save-org-button">
              Save details
            </Button>
          </div>
        </Card>

        <Card className="border-zinc-200 p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold">Your login</h2>
          <p className="text-sm text-zinc-500">
            Signed in as <span className="font-medium text-zinc-900">{user?.email}</span>
          </p>
          <div className="mt-5 space-y-2">
            <Label>New password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              data-testid="account-password-input"
            />
          </div>
          <Button
            className="mt-4 rounded-full"
            onClick={changePassword}
            disabled={password.length < 6}
            data-testid="change-password-button"
          >
            Update password
          </Button>
        </Card>

        <Card className="border-zinc-200 p-6 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Team</h2>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(true)} data-testid="add-team-button">
              <UserPlus className="mr-2 h-4 w-4" /> Add member
            </Button>
          </div>
          <div className="divide-y divide-zinc-100" data-testid="team-list">
            {team.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {m.email} · {m.role}
                  </p>
                </div>
                {m.id !== user?.id ? (
                  <button
                    className="text-zinc-400 hover:text-red-500"
                    onClick={() => removeMember(m)}
                    data-testid={`remove-team-${m.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">You</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="team-dialog">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={invite.name}
                onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                data-testid="team-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                data-testid="team-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <Input
                value={invite.password}
                onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                data-testid="team-password-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                <SelectTrigger data-testid="team-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={addMember}
              disabled={!invite.name || !invite.email || invite.password.length < 6}
              data-testid="save-team-member"
            >
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
