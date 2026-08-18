import React, { createContext, useEffect, useMemo, useState } from "react";
import { clearSession, loadSession, saveSession } from "../storage/session";
import { credimasterLoginRequest } from "../api/credimasterAuthApi";

export const SessionContext = createContext(null);

// Sesión real contra el backend Node/Express de CrediMaster (JWT). El
// backend fuerza sesión única por usuario — cada login invalida
// cualquier otra sesión activa de esa cuenta (web u otro dispositivo),
// así que dos personas no pueden compartir un mismo usuario a la vez.
export function SessionProvider({ children }) {
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [session, setSession] = useState(null); // { token, user, permissions, tenant }

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      const ok = s && s.token && s.user;

      if (ok) setSession(s);
      else {
        setSession(null);
        await clearSession();
      }

      setLoadingBoot(false);
    })();
  }, []);

  const signIn = async ({ username, password, tenant_code }) => {
    const res = await credimasterLoginRequest({
      username: (username ?? "").trim(),
      password: (password ?? "").trim(),
      tenant_code,
    });

    const newSession = {
      token: res.token,
      permissions: res.permissions || [],
      user: {
        id: res.user_id,
        user_name: res.user_name,
        full_name: res.full_name,
        role_id: res.role_id,
        department_id: res.department_id,
        branches: res.branches || [],
      },
      tenant: res.tenant,
    };

    setSession(newSession);
    await saveSession(newSession);
    return newSession;
  };

  const signOut = async () => {
    setSession(null);
    await clearSession();
  };

  // Permisos reales de CrediMaster: cadenas tipo "clientes.ver",
  // "clientes.editar" (permission_tag), no roles inventados del lado
  // móvil.
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