import { credimasterGet } from "./credimasterClient";

// "Gestores" de crédito de una sucursal (catálogo distinto del
// collector_id de pagos/caja) — usado como vendor_id al crear un
// crédito. Permiso cobradores.ver.
export const getCollectorsByBranch = (token, branchId) =>
  credimasterGet(`/api/collectors/branch/${branchId}`, token);
