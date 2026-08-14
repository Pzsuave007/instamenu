import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/apiClient";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === "super_admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-zinc-900 p-12 text-white lg:flex im-grain">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl">
            <img src="/logo.jpg" alt="InstaMenu" className="h-full w-full object-cover" />
          </span>
          <span className="font-display text-lg font-semibold">
            Insta<span className="text-orange-400">Menu</span>
          </span>
        </div>
        <div className="max-w-lg im-enter">
          <h2 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            Your menus.
            <br />
            <span className="text-orange-400">Every screen.</span>
            <br />
            Updated instantly.
          </h2>
          <p className="mt-6 text-base text-zinc-400">
            Manage digital menu boards across every location and television from one simple dashboard.
          </p>
        </div>
        <div className="flex gap-10 text-sm text-zinc-500">
          <div>
            <p className="font-display text-2xl text-white">Fire TV</p>
            <p>Plug and play pairing</p>
          </div>
          <div>
            <p className="font-display text-2xl text-white">Offline</p>
            <p>Keeps playing without Wi-Fi</p>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-white px-6 py-16 lg:w-[520px]">
        <div className="w-full max-w-sm im-enter">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl">
              <img src="/logo.jpg" alt="InstaMenu" className="h-full w-full object-cover" />
            </span>
            <span className="font-display text-lg font-semibold">InstaMenu</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-zinc-500">Welcome back. Let's get your screens updated.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@restaurant.com"
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="login-password-input"
              />
            </div>
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" data-testid="login-error">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full rounded-full" disabled={loading} data-testid="login-submit">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
