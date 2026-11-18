import { credimasterGet } from "./credimasterClient";

// Clientes inactivos (permiso clientes.inactivos.ver): los que ya cancelaron su último crédito y no tienen otro.
// `params`: collector_id (solo los de ese gestor), eligibility ("apto" | "no_apto"), q (texto).
// Responde { ok, data: { total_inactive, by_eligibility, rows: [...] } }.
export const listInactiveCustomers = (token, params = {}) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return credimasterGet(`/api/inactive-customers${qs ? `?${qs}` : ""}`, token);
};
