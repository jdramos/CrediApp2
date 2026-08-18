import React, { createContext, useEffect, useMemo, useState } from "react";
import { clearSession, loadSession, saveSession } from "../storage/session";
import { loginRequest } from "../api/authApi";
import { ROLE_PERMISSIONS } from "./permissions";
import * as Application from "expo-application";


export const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [session, setSession] = useState(null); // { user, token, permissions }

  useEffect(() => {
  (async () => {
    const s = await loadSession();

    const ok =
      s &&
      s.token &&
      s.deviceId &&
      s.user &&
      s.user.codOfi;

    if (ok) setSession(s);
    else {
      setSession(null);
      await clearSession();
    }

    setLoadingBoot(false);
  })();
}, []);
 

const signIn = async ({ nomUser, pasUser }) => {
  
  nomUser = (nomUser ?? "").trim();
  pasUser = (pasUser ?? "").trim();
  const deviceIdLocal = await getDeviceId();
  const tokenLocal = randomToken();

  const res = await loginRequest({ nomUser, pasUser, token: tokenLocal, deviceId: deviceIdLocal });

  const u = res?.user ?? {};

// ✅ usa lo que devuelve el servidor (source of truth)
const tokenServer = String(u.token ?? tokenLocal);
const deviceIdServer = String(u.device_id ?? deviceIdLocal);

  console.log("LOGIN RESPONSE FULL:", res);
console.log("LOGIN RESPONSE USER:", res?.user);

  // Tu PHP devuelve campos tipo: rolUser, codOfi, numSuc, etc.
  const roleId = Number(res.user?.rolUser ?? 0);

  // Mapea roleId -> nombre de rol (ajusta según tu sistema)
  const roleName =
    roleId === 1 ? "ADMIN" :
    roleId === 2 ? "SUPERVISOR" :
    roleId === 3 ? "PROMOTOR" :
    "COBRADOR";

  const permissions = ROLE_PERMISSIONS[roleName] ?? [];

  const newSession = {
    token: tokenServer,
    deviceId: deviceIdServer,
    user: {
      ...res.user,
      role: roleName,    // útil para UI
      rol: roleId,       // útil para endpoints que piden rol
      codOfi: res.user?.codOfi,
      numSuc: res.user?.numSuc,
    },
    permissions,
  };

  setSession(newSession);
  await saveSession(newSession);
  return newSession;
};

async function getDeviceId() {
  try {
    if (Application.getAndroidId) {
      const id = Application.getAndroidId();
      if (id) return id;
    }
    if (Application.getIosIdForVendorAsync) {
      const id = await Application.getIosIdForVendorAsync();
      if (id) return id;
    }
  } catch {}
  return `sim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function randomToken() {
  // token simple (suficiente para tu caso); si quieres algo más largo lo hacemos
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}


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