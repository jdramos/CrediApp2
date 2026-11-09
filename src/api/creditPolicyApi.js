import { credimasterGet } from "./credimasterClient";
import { cachedFetch } from "../offline/cache";

// Políticas de crédito (montos/tasas/plazos mín-máx) — permiso
// catalogos.ver o politicas_credito.ver (cualquiera de los dos).
// Respuesta plana: [{policy_key, policy_value, ...}].
// Se guarda la última respuesta para poder armar una solicitud sin señal (offline/cache.js).
export const getCreditPolicies = async (token) =>
  (await cachedFetch("loanform:policies", () => credimasterGet("/api/credit-policies", token))).data;
