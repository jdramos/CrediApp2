import { credimasterGet } from "./credimasterClient";

// Políticas de crédito (montos/tasas/plazos mín-máx) — permiso
// catalogos.ver o politicas_credito.ver (cualquiera de los dos).
// Respuesta plana: [{policy_key, policy_value, ...}].
export const getCreditPolicies = (token) => credimasterGet("/api/credit-policies", token);
