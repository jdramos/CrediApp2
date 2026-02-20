import React, { createContext, useEffect, useMemo, useState } from "react";
import { clearSession, loadSession, saveSession } from "../storage/session";
import { loginRequest } from "../api/authApi";
import { ROLE_PERMISSIONS } from "./permissions";

export const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [session, setSession] = useState(null); // { user, token, permissions }

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      setSession(s);
      setLoadingBoot(false);
    })();
  }, []);

  const signIn = async ({ user_name, password }) => {
    // mock login (luego lo conectas a tu backend)
    const res = await loginRequest({ user_name, password });

    // Si no quieres permisos en JWT: aquí simula "traer permisos por rol"
    const role = res.user.role;
    const permissions = ROLE_PERMISSIONS[role] ?? [];

    const newSession = { token: res.token, user: res.user, permissions };
    setSession(newSession);
    await saveSession(newSession);
    return newSession;
  };

  const signOut = async () => {
    setSession(null);
    await clearSession();
  };

  const hasPerm = (perm) => {
    if (!session?.permissions) return false;
    return session.permissions.includes(perm);
  };

  const value = useMemo(
    () => ({ loadingBoot, session, setSession, signIn, signOut, hasPerm }),
    [loadingBoot, session]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}