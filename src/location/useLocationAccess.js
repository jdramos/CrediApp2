import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";

// Cada cuánto se vuelve a comprobar mientras la app está abierta: el usuario
// puede apagar el GPS desde el panel rápido sin salir de la app.
const RECHECK_MS = 4000;

// Estados del acceso a la ubicación:
//   checking     primera comprobación todavía en curso
//   ok           permiso concedido y ubicación del dispositivo encendida
//   denied       falta el permiso, todavía se puede pedir
//   blocked      el permiso se negó "para siempre": solo se arregla en Ajustes
//   services-off permiso concedido pero la ubicación del dispositivo está apagada
//   error        no se pudo comprobar (se trata como bloqueado)
// Función pura para poder razonarla aparte de la plataforma.
export function resolveLocationState({ granted, canAskAgain, servicesEnabled }) {
  if (!granted) return canAskAgain === false ? "blocked" : "denied";
  if (!servicesEnabled) return "services-off";
  return "ok";
}

async function readLocationAccess() {
  const perm = await Location.getForegroundPermissionsAsync();
  const servicesEnabled = perm.granted ? await Location.hasServicesEnabledAsync() : true;
  return resolveLocationState({ granted: perm.granted, canAskAgain: perm.canAskAgain, servicesEnabled });
}

// Estado vivo del acceso a la ubicación + acciones para corregirlo. Se
// re-evalúa al volver la app a primer plano y cada pocos segundos. Con
// `enabled: false` (usuario con excepción) no comprueba nada y devuelve "ok".
export function useLocationAccess({ enabled = true } = {}) {
  const [state, setState] = useState("checking");
  const [detail, setDetail] = useState("");
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await readLocationAccess();
      if (alive.current) {
        setState(next);
        if (next === "ok") setDetail("");
      }
      return next;
    } catch (e) {
      // No se pudo saber: se bloquea (la regla es no operar sin ubicación) y
      // se muestra el motivo para poder diagnosticarlo.
      if (alive.current) {
        setState("error");
        setDetail(e?.message || "No se pudo comprobar la ubicación.");
      }
      return "error";
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    alive.current = true;
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    const timer = setInterval(refresh, RECHECK_MS);
    return () => {
      alive.current = false;
      sub.remove();
      clearInterval(timer);
    };
  }, [refresh, enabled]);

  // Pide el permiso (solo funciona si todavía se puede preguntar).
  const requestPermission = useCallback(async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch (e) {
      if (alive.current) setDetail(e?.message || "No se pudo pedir el permiso de ubicación.");
    }
    return refresh();
  }, [refresh]);

  // Android: muestra el diálogo del sistema para encender la ubicación.
  const enableServices = useCallback(async () => {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      // el usuario rechazó el diálogo o no hay Play Services: sigue bloqueado
    }
    return refresh();
  }, [refresh]);

  return { state: enabled ? state : "ok", detail, refresh, requestPermission, enableServices };
}
