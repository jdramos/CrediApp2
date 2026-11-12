import React, { createContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { clearSession, loadSession, saveSession, getTrustedDeviceToken, saveTrustedDeviceToken } from "../storage/session";
import { credimasterLoginRequest, credimasterMfaVerify } from "../api/credimasterAuthApi";
import { setUnauthorizedHandler, setPasswordChangeRequiredHandler } from "../api/credimasterClient";
import { registerPushToken, unregisterPushToken } from "../api/pushApi";
import { registerForPushNotificationsAsync } from "../notifications/pushNotifications";
import { cancelReminders } from "../notifications/reminders";
import { clearCache } from "../offline/cache";
import { resetTracking, setTrackingSessionGetter } from "../tracking/tracker";
import { queueCount, setQueueOwner } from "../offline/queue";
import { flushQueue } from "../offline/syncManager";
import { isConnected } from "../offline/network";
import { confirmAction } from "../utils/confirm";
import { setNoticeReporter } from "../utils/contact";
import { reportPaymentNotice } from "../api/paymentNoticeApi";
import { flushCrashReports } from "../utils/crashLog";

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

  // El rastreo de ruta (tracking/tracker.js) vive fuera de React y necesita
  // saber en cada envío quién es el usuario y su token ACTUALES.
  const sessionRef = useRef(null);
  sessionRef.current = session;
  // Dueño de la cola de pendientes (offline/queue.js): se fija al renderizar, antes de que ninguna
  // pantalla encole o lea, para que cada pendiente quede a nombre de quien lo creó.
  setQueueOwner(session?.user?.id ?? null);
  useEffect(() => {
    setTrackingSessionGetter(() =>
      sessionRef.current
        ? { token: sessionRef.current.token, userId: sessionRef.current.user?.id ?? null }
        : null,
    );
  }, []);
  // Los avisos manuales por SMS/WhatsApp (utils/contact.js) se reportan a la oficina
  // con el token de la sesión actual, sin esperar la respuesta ni estorbar el envío.
  useEffect(() => {
    setNoticeReporter((payload) => {
      const token = sessionRef.current?.token;
      if (token) reportPaymentNotice(token, payload).catch(() => {});
    });
    return () => setNoticeReporter(null);
  }, []);
  // Contraseña temporal sin cambiar (ver passwordChangeRequired abajo): la app solo
  // muestra la pantalla obligatoria y no manda nada más al servidor.
  const passwordChangeRequired = !!session?.user?.must_change_password;

  // Con sesión abierta se mandan al servidor los errores y cierres inesperados guardados (utils/crashLog.js).
  useEffect(() => {
    if (session?.token && !passwordChangeRequired) flushCrashReports(session.token);
  }, [session?.token, passwordChangeRequired]);

  // El servidor dice que la contraseña es temporal aunque la sesión guardada no lo
  // sabía (por ejemplo, una sesión abierta antes de esta versión de la app): se marca
  // y la app pasa a la pantalla obligatoria.
  useEffect(() => {
    setPasswordChangeRequiredHandler(() => {
      const current = sessionRef.current;
      if (!current?.token || current.user?.must_change_password) return;
      const next = { ...current, user: { ...current.user, must_change_password: true } };
      sessionRef.current = next;
      setSession(next);
      saveSession(next).catch(() => {});
    });
    return () => setPasswordChangeRequiredHandler(null);
  }, []);
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

  // Cierra el login con la respuesta del servidor (primer paso sin 2FA, o el
  // segundo paso ya verificado): arma y guarda la sesión.
  const finishLogin = async (res) => {
    const newSession = {
      token: res.token,
      permissions: res.permissions || [],
      user: {
        id: res.user_id,
        user_name: res.user_name,
        full_name: res.full_name,
        role_id: res.role_id,
        department_id: res.department_id,
        collector_id: res.collector_id ?? null,
        // Excepción a la ubicación obligatoria (se administra desde la web).
        location_exempt: !!res.location_exempt,
        // Horario de uso de la app (se administra desde la web): { restricted, allowed, windows }.
        app_schedule: res.app_schedule || null,
        branches: res.branches || [],
        // Contraseña temporal (usuario nuevo o restablecida por un administrador):
        // la app muestra solo la pantalla de cambio obligatorio hasta que la cambie.
        // Va guardado en la sesión para que reabrir la app no se la salte.
        must_change_password: res.must_change_password === true,
      },
      tenant: res.tenant,
    };

    setSession(newSession);
    await saveSession(newSession);

    // Con la contraseña temporal el registro de push espera al cambio (completePasswordChange).
    if (!newSession.user.must_change_password) registerPush(newSession.token);

    return newSession;
  };

  const registerPush = (token) => {
    // Best-effort: registrar el token de push del dispositivo para este
    // usuario. Si falla (sin permiso, emulador, falta projectId de EAS)
    // la app sigue funcionando normal, solo sin notificaciones push.
    registerForPushNotificationsAsync()
      .then((deviceToken) => {
        if (deviceToken) return registerPushToken(token, deviceToken, Platform.OS);
      })
      .catch(() => {});
  };

  // La pantalla obligatoria ya cambió la contraseña en el servidor (que conserva
  // esta misma sesión): se libera la marca y la app entra normal.
  const completePasswordChange = async () => {
    const current = sessionRef.current;
    if (!current?.token) return;
    const next = { ...current, user: { ...current.user, must_change_password: false } };
    sessionRef.current = next;
    setSession(next);
    await saveSession(next);
    registerPush(next.token);
  };

  // Si el usuario ya verificó este dispositivo, se manda su token y el servidor
  // no pide el código. Si la empresa exige 2FA, esto lanza un error con
  // `data.code === "MFA_REQUIRED"` y `data.mfa_token` (lo maneja LoginScreen).
  const signIn = async ({ username, password, tenant_code }) => {
    const res = await credimasterLoginRequest({
      username: (username ?? "").trim(),
      password: (password ?? "").trim(),
      tenant_code,
      trusted_device_token: (await getTrustedDeviceToken(username)) || undefined,
    });
    return finishLogin(res);
  };

  const signInWithMfa = async ({ username, mfa_token, code, remember_device }) => {
    const res = await credimasterMfaVerify({ mfa_token, code: (code ?? "").trim(), remember_device });
    if (res?.trusted_device_token) await saveTrustedDeviceToken(username, res.trusted_device_token);
    return finishLogin(res);
  };

  // `force` salta la advertencia de pendientes (la usa el propio botón de
  // "Cerrar sesión de todas formas" y el logout forzado por 401). `silent`
  // evita el best-effort de unregister de push (no tiene sentido pegarle
  // al backend con un token que ya sabemos inválido) y no muestra un
  // segundo Alert -- lo usa el logout forzado por 401, que ya avisó al
  // usuario por su cuenta (ver arriba).
  //
  // Los pendientes de sincronizar NO se borran al cerrar sesión (ni cuando el servidor la cierra
  // solo, por vencer o por entrar desde otro dispositivo): se quedan en el teléfono a nombre de su
  // dueño y se envían cuando ese usuario vuelve a iniciar sesión (offline/queue.js). Antes se
  // descartaban y un cobro hecho sin señal se perdía.
  const signOut = async ({ force = false, silent = false } = {}) => {
    if (!force) {
      let pending = await queueCount();
      // Con señal se intenta enviar todo ahora, mientras todavía hay sesión (con la
      // contraseña temporal el servidor no lo acepta: se queda para el próximo ingreso).
      if (pending > 0 && session?.token && !session.user?.must_change_password) {
        try {
          if (await isConnected()) {
            await flushQueue(session.token);
            pending = await queueCount();
          }
        } catch {
          // se sigue con lo que quede
        }
      }
      if (pending > 0) {
        confirmAction(
          "Acciones pendientes de sincronizar",
          `Quedan ${pending} acción${pending === 1 ? "" : "es"} (pagos, clientes, fotos, evaluaciones, ubicaciones o visitas) sin enviar. Se quedan guardadas en este teléfono, solo para su usuario, y se envían solas cuando vuelva a iniciar sesión con señal. Hasta entonces no llegan a la oficina. ¿Cerrar sesión?`,
          () => signOut({ force: true }),
          { confirmText: "Cerrar sesión" },
        );
        return;
      }
    }

    // Antes de soltar la sesión: se envía lo pendiente del rastreo (todavía hay
    // token) y se borra del teléfono.
    await resetTracking();

    const token = session?.token;
    setSession(null);
    await clearSession();
    await cancelReminders();
    await clearCache();

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
    () => ({
      loadingBoot,
      session,
      setSession,
      signIn,
      signInWithMfa,
      signOut,
      hasPerm,
      passwordChangeRequired,
      completePasswordChange,
    }),
    [loadingBoot, session]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}