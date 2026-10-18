import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

import { api, endSession } from "../lib/api.js";
import { auth } from "../lib/auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const session = useSyncExternalStore(auth.subscribe, auth.getSnapshot);

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password }, { auth: false });
    auth.setSession(data);
    return data.user;
  }, []);

  const register = useCallback(
    async (payload) => {
      await api.post("/auth/register", payload, { auth: false });
      return login(payload.email, payload.password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    await endSession();
    auth.clear();
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await api.get("/auth/me");
    auth.setUser(user);
    return user;
  }, []);

  const value = useMemo(
    () => ({
      user: session.user,
      isLoggedIn: Boolean(session.access),
      isStaff: auth.isStaff(),
      isAdmin: auth.isAdmin(),
      login,
      register,
      logout,
      refreshUser,
    }),
    [session, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
