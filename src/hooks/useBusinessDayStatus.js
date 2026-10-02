import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getBusinessDayStatus } from "../api/businessDayApi";

// Best-effort: si falla (sin permiso dia.ver, sin conexión, error del
// servidor) simplemente no se muestra el aviso -- el backend igual valida
// al confirmar la operación real, esto es solo una mejora de UX para
// avisar antes, no la fuente de verdad.
export function useBusinessDayStatus(token, branchId) {
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!token || !branchId) {
      setStatus(null);
      return;
    }
    try {
      const res = await getBusinessDayStatus(token, branchId);
      setStatus(res || null);
    } catch {
      setStatus(null);
    }
  }, [token, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return status;
}

// Igual que arriba, pero para TODAS las sucursales del usuario a la vez
// (session.user.branches, ids) y re-consultando cada vez que la pantalla
// vuelve a tener foco -- el cobrador deja la app abierta en segundo plano y
// el día puede abrirse/cerrarse mientras tanto. Devuelve solo las sucursales
// con problema (día sin abrir, o día anterior sin cerrar), cada una como
// `{ branchId, status }`; lista vacía si todo está operativo o si la
// consulta falla (sin permiso dia.ver, sin conexión: no se avisa).
export function useBusinessDayAlerts(token, branchIds) {
  const [alerts, setAlerts] = useState([]);
  const key = Array.isArray(branchIds) ? branchIds.join(",") : "";

  useFocusEffect(
    useCallback(() => {
      const ids = key ? key.split(",").map(Number).filter(Boolean) : [];
      if (!token || ids.length === 0) {
        setAlerts([]);
        return undefined;
      }
      let cancelled = false;
      Promise.allSettled(ids.map((id) => getBusinessDayStatus(token, id))).then((results) => {
        if (cancelled) return;
        const found = [];
        results.forEach((r, i) => {
          if (r.status !== "fulfilled" || !r.value) return;
          const st = r.value;
          const operational = st.pending_action === "CLOSE" && !st.is_backlog;
          if (!operational) found.push({ branchId: ids[i], status: st });
        });
        setAlerts(found);
      });
      return () => {
        cancelled = true;
      };
    }, [token, key]),
  );

  return alerts;
}
