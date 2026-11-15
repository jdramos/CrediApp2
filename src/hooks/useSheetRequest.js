import { useEffect, useState } from "react";
import { getCreditPolicies } from "../api/creditPolicyApi";
import { isSheetEnabled } from "../utils/clientRequestSheet";

// ¿La empresa usa la «Solicitud de crédito nuevo» en una sola hoja (política solicitud_cliente_nuevo_hoja)?
// Las políticas se guardan para uso sin señal; si no se pueden leer (sin permiso de catálogos) queda apagada y todo sigue como siempre.
export default function useSheetRequest(token) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!token) return undefined;
    getCreditPolicies(token)
      .then((rows) => {
        const map = {};
        (rows || []).forEach((p) => { map[p.policy_key] = p.policy_value; });
        if (alive) setEnabled(isSheetEnabled(map));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  return enabled;
}
