import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Locations from "@/pages/Locations";
import Screens from "@/pages/Screens";
import ScreenDetail from "@/pages/ScreenDetail";
import Playlists from "@/pages/Playlists";
import PlaylistEditor from "@/pages/PlaylistEditor";
import MediaLibrary from "@/pages/MediaLibrary";
import Devices from "@/pages/Devices";
import Account from "@/pages/Account";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminRestaurants from "@/pages/admin/AdminRestaurants";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminSystem from "@/pages/admin/AdminSystem";

const Loading = () => (
  <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">Loading InstaMenu…</div>
);

function Protected({ children, adminOnly }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function Landing() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "super_admin" && !user.impersonating ? "/admin" : "/dashboard"} replace />;
}

function LoginRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/locations" element={<Protected><Locations /></Protected>} />
            <Route path="/screens" element={<Protected><Screens /></Protected>} />
            <Route path="/screens/:screenId" element={<Protected><ScreenDetail /></Protected>} />
            <Route path="/playlists" element={<Protected><Playlists /></Protected>} />
            <Route path="/playlists/:playlistId" element={<Protected><PlaylistEditor /></Protected>} />
            <Route path="/media" element={<Protected><MediaLibrary /></Protected>} />
            <Route path="/devices" element={<Protected><Devices /></Protected>} />
            <Route path="/account" element={<Protected><Account /></Protected>} />
            <Route path="/admin" element={<Protected adminOnly><AdminOverview /></Protected>} />
            <Route path="/admin/restaurants" element={<Protected adminOnly><AdminRestaurants /></Protected>} />
            <Route path="/admin/users" element={<Protected adminOnly><AdminUsers /></Protected>} />
            <Route path="/admin/subscriptions" element={<Protected adminOnly><AdminSubscriptions /></Protected>} />
            <Route path="/admin/system" element={<Protected adminOnly><AdminSystem /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
