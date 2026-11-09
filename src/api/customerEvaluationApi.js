import { credimasterGet, credimasterPost } from "./credimasterClient";

// Evaluación financiera vigente del cliente (o null si no tiene) —
// permiso clientes.evaluacion.ver. Se usa para prellenar
// credit_evaluation_id en la solicitud y para mostrar la evaluación ya hecha.
export const getCurrentEvaluation = (token, customerId) =>
  credimasterGet(`/api/customer-credit-evaluations/${customerId}/current`, token);

// Conceptos activos de la empresa (ingresos, gastos, deudas) y opciones fijas
// (metodología, referencias, buró) para armar el formulario — permiso
// clientes.evaluacion.insertar.
export const getEvaluationFormOptions = (token) =>
  credimasterGet("/api/customer-credit-evaluations/form-options", token);

// Registra la evaluación (el servidor calcula puntajes, riesgo y recomendación con la
// configuración de la empresa y el expediente real del cliente) — permiso
// clientes.evaluacion.insertar. Un 409 = el cliente ya tiene una evaluación vigente.
export const createEvaluation = (token, payload) =>
  credimasterPost("/api/customer-credit-evaluations", payload, token);
