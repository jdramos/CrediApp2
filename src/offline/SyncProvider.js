import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SessionContext } from "../auth/SessionContext";
import { subscribeToConnectivity, isConnected } from "./network";
import { flushQueue } from "./syncManager";
import { queueCount } from "./queue";
import { prefetchOfflineData } from "./prefetch";

export const SyncContext = createContext({
  pendingCount: 0,
  syncing: false,
  syncNow: async () => {},
  refreshPendingCount: async () => {},
});

// Se monta una sola vez a nivel app (dentro de SessionProvider, para
// poder leer el token). Escucha conectividad: NetInfo dispara el
// listener también con el estado actual apenas se suscribe, así que
// esto cubre tanto "recuperé señal con la app abierta" como "abrí la
// app y ya había señal" sin lógica aparte.
export function SyncProvider({ children }) {
  const { session } = useContext(SessionContext);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const tokenRef = useRef(null);
  tokenRef.current = session?.token || null;

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await queueCount());
  }, []);

  const syncNow = useCallback(async () => {
    if (!tokenRef.current) return;
    setSyncing(true);
    try {
      await flushQueue(tokenRef.current);
    } finally {
      setSyncing(false);
      refreshPendingCount();
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Con conexión y ya iniciada la sesión, se dejan guardados los datos que el cobrador va a
  // necesitar sin señal (catálogos del cliente nuevo, formas de pago, opciones de la evaluación).
  // Una vez por sesión: se borran al cerrar sesión (cache.js).
  const prefetchedFor = useRef(null);
  const prefetchOffline = useCallback(() => {
    const token = tokenRef.current;
    if (!token || prefetchedFor.current === token) return;
    prefetchedFor.current = token;
    prefetchOfflineData(token, session?.user?.id, session?.permissions || []).catch(() => {
      prefetchedFor.current = null; // se vuelve a intentar con la próxima conexión
    });
  }, [session?.user?.id, session?.permissions]);

  // Iniciar sesión con conexión también deja los datos guardados (el listener de abajo solo
  // reacciona a cambios de conexión).
  useEffect(() => {
    if (!session?.token) return;
    isConnected()
      .then((on) => {
        if (!on) return;
        syncNow(); // lo que este usuario dejó pendiente la vez anterior
        prefetchOffline();
      })
      .catch(() => {});
  }, [session?.token, prefetchOffline, syncNow]);

  // Al cambiar de usuario cambia la cola visible: se recalcula el contador.
  useEffect(() => {
    refreshPendingCount();
  }, [session?.user?.id, refreshPendingCount]);

  useEffect(() => {
    const unsubscribe = subscribeToConnectivity((online) => {
      if (online) {
        syncNow();
        prefetchOffline();
      }
    });
    return unsubscribe;
  }, [syncNow, prefetchOffline]);

  return (
    <SyncContext.Provider value={{ pendingCount, syncing, syncNow, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
