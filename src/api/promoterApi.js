import { credimasterGet } from "./credimasterClient";

// Promotores (oficiales de crédito) de una sucursal — permiso
// promotores.ver. Respuesta plana: [{id, name, identification, ...}].
export const getPromotersByBranch = (token, branchId) =>
  credimasterGet(`/api/promoters/branch/${branchId}`, token);
