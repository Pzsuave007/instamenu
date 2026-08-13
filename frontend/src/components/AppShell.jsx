import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Building2,
  CreditCard,
  Image,
  LayoutDashboard,
  ListVideo,
  LogOut,
  Menu,
  Monitor,
  Settings,
  ShieldCheck,
  Tv,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const restaurantNav = [
  { to: "/dashboard", label: "My TVs", icon: LayoutDashboard },
  { to: "/screens", label: "Screens", icon: Monitor },
  { to: "/media", label: "Media Library", icon: Image },
  { to: "/devices", label: "Fire TV Devices", icon: Tv },
  { to: "/playlists", label: "Playlists", icon: ListVideo },
  { to: "/account", label: "Settings", icon: Settings },
];

const adminNav = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/restaurants", label: "Restaurants", icon: Building2 },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/admin/system", label: "System", icon: ShieldCheck },
];

export function AppShell({ children }) {
  const { user, logout, stopImpersonation } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isAdminArea = user?.role === "super_admin" && !user?.impersonating;
  const nav = isAdminArea ? adminNav : restaurantNav;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleStopImpersonation = async () => {
    await stopImpersonation();
    navigate("/admin/restaurants");
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to={isAdminArea ? "/admin" : "/dashboard"} className="flex items-center gap-2.5 px-6 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white">
          <Tv className="h-5 w-5" />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight text-zinc-900">
          Insta<span className="text-orange-500">Menu</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1 px-3" data-testid="sidebar-nav">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/admin"}
            onClick={() => setOpen(false)}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium duration-200 ${
                isActive
                  ? "bg-orange-50 text-orange-700"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-zinc-200 p-4">
        <div className="mb-3 px-2">
          <p className="truncate text-sm font-semibold text-zinc-900" data-testid="sidebar-user-name">
            {user?.name}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {user?.organization?.name || (isAdminArea ? "Platform Admin" : user?.email)}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 rounded-xl text-zinc-600 hover:text-zinc-900"
          onClick={handleLogout}
          data-testid="logout-button"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-zinc-200 bg-white lg:block">
        {sidebar}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button
              className="absolute right-4 top-5 text-zinc-400"
              onClick={() => setOpen(false)}
              data-testid="close-sidebar"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} data-testid="open-sidebar" className="text-zinc-700">
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-display font-semibold">InstaMenu</span>
        </header>

        {user?.impersonating ? (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900 px-6 py-2.5 text-sm text-white">
            <span data-testid="impersonation-banner">
              Support mode — viewing <strong>{user?.organization?.name}</strong>
            </span>
            <button className="underline" onClick={handleStopImpersonation} data-testid="exit-impersonation">
              Exit support mode
            </button>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-zinc-500">{subtitle}</p> : null}
    </div>
    {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
  </div>
);
