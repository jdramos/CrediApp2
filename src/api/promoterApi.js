import { credimasterGet } from "./credimasterClient";
import { cachedFetch } from "../offline/cache";

// Promotores (oficiales de crédito) de una sucursal — permiso
// promotores.ver. Respuesta plana: [{id, name, identification, ...}].
// Se guarda la última respuesta por sucursal para poder armar una solicitud sin señal (offline/cache.js).
export const getPromotersByBranch = async (token, branchId) =>
  (await cachedFetch(`loanform:promoters:${branchId}`, () => credimasterGet(`/api/promoters/branch/${branchId}`, token))).data;
