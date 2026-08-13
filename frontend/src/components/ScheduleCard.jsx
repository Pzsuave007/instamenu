import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, apiError } from "@/lib/apiClient";
import { toast } from "sonner";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS = [
  { label: "Every day", days: [] },
  { label: "Mon–Fri", days: [0, 1, 2, 3, 4] },
  { label: "Weekends", days: [5, 6] },
];
const NEW_MENU = "__new__";

const describeDays = (days) => {
  if (!days?.length) return "Every day";
  if (days.length === 7) return "Every day";
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAYS[d])
    .join(", ");
};

/** Time-of-day rules for one screen: breakfast / lunch / dinner menus. */
export const ScheduleCard = ({ screen, playlists, onChanged, onPlaylistCreated }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ playlist_id: "", days: [], start_time: "06:00", end_time: "11:00" });
  const [newMenuName, setNewMenuName] = useState("");
  const [saving, setSaving] = useState(false);
  const rules = screen.schedules || [];

  const toggleDay = (d) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] }));

  const save = async () => {
    setSaving(true);
    try {
      let playlistId = form.playlist_id;
      if (playlistId === NEW_MENU) {
        const { data } = await api.post("/playlists", { name: newMenuName || "New menu", items: [] });
        playlistId = data.id;
        onPlaylistCreated?.(data);
      }
      await api.post("/schedules", {
        screen_id: screen.id,
        playlist_id: playlistId,
        days_of_week: form.days,
        start_time: form.start_time,
        end_time: form.end_time,
      });
      toast.success("Time slot added — the TV switches by itself");
      setOpen(false);
      setForm({ playlist_id: "", days: [], start_time: "06:00", end_time: "11:00" });
      setNewMenuName("");
      onChanged();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule) => {
    try {
      await api.delete(`/schedules/${rule.id}`);
      toast.success("Time slot removed");
      onChanged();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Card className="border-zinc-200 p-6 shadow-sm" data-testid="schedule-card">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-4 w-4 text-orange-500" /> Time slots
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => setOpen(true)}
          data-testid="add-schedule-button"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add slot
        </Button>
      </div>
      <p className="mb-5 text-sm text-zinc-500">
        Show a different menu at set hours — breakfast, lunch, dinner. Outside these hours this screen plays its own
        content.
      </p>

      {rules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
          No time slots yet. This screen plays the same content all day.
        </p>
      ) : (
        <div className="divide-y divide-zinc-100" data-testid="schedule-list">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-3 py-3" data-testid={`schedule-${rule.id}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{rule.playlist_name || "Deleted menu"}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {rule.start_time}–{rule.end_time} · {describeDays(rule.days_of_week)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild variant="ghost" size="sm" className="rounded-full text-xs">
                  <Link to={`/playlists/${rule.playlist_id}`}>Edit menu</Link>
                </Button>
                <button
                  className="text-zinc-400 hover:text-red-500"
                  onClick={() => remove(rule)}
                  data-testid={`delete-schedule-${rule.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {screen.timezone ? (
        <p className="mt-4 text-xs text-zinc-400">
          Times follow this location's timezone ({screen.timezone.replace("_", " ")}).
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="schedule-dialog">
          <DialogHeader>
            <DialogTitle>New time slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Which menu should play?</Label>
              <Select value={form.playlist_id} onValueChange={(v) => setForm({ ...form, playlist_id: v })}>
                <SelectTrigger data-testid="schedule-playlist-select">
                  <SelectValue placeholder="Choose a menu" />
                </SelectTrigger>
                <SelectContent>
                  {playlists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.item_count} items)
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_MENU}>+ Create a new menu…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.playlist_id === NEW_MENU ? (
              <div className="space-y-2">
                <Label>New menu name</Label>
                <Input
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  placeholder="Breakfast Menu"
                  data-testid="schedule-new-menu-name"
                />
                <p className="text-xs text-zinc-500">It starts empty — add videos to it afterwards.</p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  data-testid="schedule-start-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Until</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  data-testid="schedule-end-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Days</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setForm({ ...form, days: p.days })}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 duration-200 hover:border-orange-300 hover:text-zinc-900"
                    data-testid={`schedule-preset-${p.label.toLowerCase().replace(/[^a-z]/g, "")}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(i)}
                    className={`h-9 w-11 rounded-lg border text-xs font-medium duration-200 ${
                      form.days.includes(i)
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                    }`}
                    data-testid={`schedule-day-${i}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">{describeDays(form.days)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={save}
              disabled={
                saving || !form.playlist_id || (form.playlist_id === NEW_MENU && newMenuName.trim().length === 0)
              }
              data-testid="save-schedule"
            >
              Add time slot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
