import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, apiError, setToken } from "@/lib/apiClient";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anonymous
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(false);
  };

  const impersonate = async (orgId) => {
    const { data } = await api.post(`/admin/impersonate/${orgId}`);
    setToken(data.token);
    await load();
  };

  const stopImpersonation = async () => {
    const { data } = await api.post("/auth/stop-impersonation");
    setToken(data.token);
    setUser(data.user);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, impersonate, stopImpersonation, refresh: load, apiError }}>
      {children}
    </AuthContext.Provider>
  );
}
