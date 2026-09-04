import { useCallback, useEffect, useState } from "react";
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
