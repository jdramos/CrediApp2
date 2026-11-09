import { credimasterGet } from "./credimasterClient";
import { cachedFetch } from "../offline/cache";

// "Gestores" de crédito de una sucursal (catálogo distinto del
// collector_id de pagos/caja) — usado como vendor_id al crear un
// crédito. Permiso cobradores.ver.
// Se guarda la última respuesta por sucursal para poder armar una solicitud sin señal (offline/cache.js).
export const getCollectorsByBranch = async (token, branchId) =>
  (await cachedFetch(`loanform:collectors:${branchId}`, () => credimasterGet(`/api/collectors/branch/${branchId}`, token))).data;
