import React, { createContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { clearSession, loadSession, saveSession } from "../storage/session";
import { credimasterLoginRequest } from "../api/credimasterAuthApi";
import { setUnauthorizedHandler } from "../api/credimasterClient";
import { registerPushToken, unregisterPushToken } from "../api/pushApi";
import { registerForPushNotificationsAsync } from "../notifications/pushNotifications";
import { cancelReminders } from "../notifications/reminders";
import { queueCount } from "../offline/queue";
import { discardQueue } from "../offline/syncManager";
import { confirmAction } from "../utils/confirm";

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

  // credimasterClient.js vive fuera de React (módulo plano) y no puede
  // llamar signOut() él solo cuando el backend devuelve 401 (token
  // vencido/inválido) -- se registra acá un puente. Se usa un ref para
  // siempre invocar el signOut MÁS RECIENTE (con el `session` actual en su
  // closure) sin tener que re-registrar el handler en cada render.
  const signOutRef = useRef();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      Alert.alert(
        "Sesión expirada",
        "Por seguridad tu sesión terminó (venció o se inició en otro dispositivo). Iniciá sesión de nuevo.",
      );
      signOutRef.current?.({ force: true, silent: true });
    });
    return () => setUnauthorizedHandler(null);
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

    // Best-effort: registrar el token de push del dispositivo para este
    // usuario. Si falla (sin permiso, emulador, falta projectId de EAS)
    // la app sigue funcionando normal, solo sin notificaciones push.
    registerForPushNotificationsAsync()
      .then((deviceToken) => {
        if (deviceToken) return registerPushToken(newSession.token, deviceToken, Platform.OS);
      })
      .catch(() => {});

    return newSession;
  };

  // `force` salta la advertencia de pendientes (la usa el propio botón de
  // "Cerrar sesión de todas formas" y el logout forzado por 401). `silent`
  // evita el best-effort de unregister de push (no tiene sentido pegarle
  // al backend con un token que ya sabemos inválido) y no muestra un
  // segundo Alert -- lo usa el logout forzado por 401, que ya avisó al
  // usuario por su cuenta (ver arriba).
  const signOut = async ({ force = false, silent = false } = {}) => {
    if (!force) {
      const pending = await queueCount();
      if (pending > 0) {
        confirmAction(
          "Acciones pendientes de sincronizar",
          `Tenés ${pending} acción${pending === 1 ? "" : "es"} (pagos, fotos, documentos, ubicaciones o visitas) sin sincronizar. Si cerrás sesión ahora se van a perder, porque no le pertenecen a la siguiente persona que use este dispositivo. ¿Cerrar sesión de todas formas?`,
          () => signOut({ force: true }),
          { confirmText: "Cerrar sesión y perder lo pendiente", destructive: true },
        );
        return;
      }
    }

    const token = session?.token;
    setSession(null);
    await clearSession();
    await discardQueue();
    await cancelReminders();

    if (token && !silent) {
      registerForPushNotificationsAsync()
        .then((deviceToken) => {
          if (deviceToken) return unregisterPushToken(token, deviceToken);
        })
        .catch(() => {});
    }
  };

  signOutRef.current = signOut;

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