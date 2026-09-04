import { credimasterGet } from "./credimasterClient";

// Evaluación financiera vigente del cliente (o null si no tiene) —
// permiso clientes.evaluacion.ver. Se usa solo para prellenar
// credit_evaluation_id, no es editable desde la app.
export const getCurrentEvaluation = (token, customerId) =>
  credimasterGet(`/api/customer-credit-evaluations/${customerId}/current`, token);
