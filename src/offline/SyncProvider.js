import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SessionContext } from "../auth/SessionContext";
import { subscribeToConnectivity } from "./network";
import { flushQueue } from "./syncManager";
import { queueCount } from "./queue";

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

  useEffect(() => {
    const unsubscribe = subscribeToConnectivity((online) => {
      if (online) syncNow();
    });
    return unsubscribe;
  }, [syncNow]);

  return (
    <SyncContext.Provider value={{ pendingCount, syncing, syncNow, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
