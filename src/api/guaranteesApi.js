import { credimasterGet } from "./credimasterClient";

// Garantías del cliente, con disponibilidad ya calculada por el backend
// (is_committed / available_value) — permiso garantias.ver.
export const getCustomerGuarantees = (token, customerId) =>
  credimasterGet(`/api/guarantees/${customerId}`, token);
