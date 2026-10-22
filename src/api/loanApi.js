import { credimasterGet, credimasterPost } from "./credimasterClient";

// Créditos activos de un cliente (para elegir cuál pagar) — permiso
// creditos.ver.
export const getCustomerActiveLoans = (token, customerId) =>
  credimasterGet(`/api/loans/customer/${customerId}/active-summary`, token);

// Detalle de un crédito (saldo actual, estado) — permiso
// creditos.detalle.ver.
export const getLoanDetail = (token, loanId) =>
  credimasterGet(`/api/loans/${loanId}`, token);

// Tabla de amortización — permiso creditos.amortizacion.ver. Sirve para
// mostrar cuál es la próxima cuota antes de registrar un pago.
export const getLoanAmortization = (token, loanId) =>
  credimasterGet(`/api/loans/amortization/${loanId}`, token);

// Crea una solicitud de crédito nueva (queda en PENDING, esperando
// aprobación). Permiso creditos.insertar. El backend valida mucho más
// de lo que se manda acá (expediente del cliente, políticas de crédito,
// garantías) — cualquier requisito faltante vuelve como un 400 con un
// mensaje legible, que se muestra tal cual en la pantalla.
export const createLoanRequest = (token, payload) =>
  credimasterPost("/api/loans", payload, token);

// Lista de créditos con filtros — permiso creditos.ver. `params` admite
// page/limit, status ("PENDIENTE"/"APROBADO"/"RECHAZADO", vacío = todos),
// startDate/endDate (deben ir juntos), search (nombre o cédula) y
// branch_id. El backend NO limita por sucursal automáticamente — si no
// se manda branch_id, devuelve créditos de todo el tenant.
export const getLoans = (token, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return credimasterGet(`/api/loans${qs ? `?${qs}` : ""}`, token);
};

// Estado de cuenta completo (saldo capital/interés/seguro/cargos, mora,
// y el detalle de cada cuota) — permiso creditos.estado_cuenta.ver.
export const getAccountStatement = (token, loanId, date) =>
  credimasterGet(`/api/loans/${loanId}/account-statement${date ? `?date=${date}` : ""}`, token);

// Tabla de amortización de una simulación (no guarda nada) — permiso
// creditos.amortizacion.ver. El tipo de interés lo define la empresa, no el
// formulario. `term` va en MESES; la cantidad de cuotas sale de la frecuencia
// (`frequency_id` es el tag: D, S, B, Q, M, BM, TM, CM, SM, A). Devuelve el
// arreglo de cuotas con la fila 0 del desembolso.
export const simulateLoan = (token, { amount, interest_rate, term, requestDate, fee, insurance, other_charges, frequency_id, branch_id }) =>
  credimasterPost(
    "/api/loans/amortization",
    { amount, interest_rate, term, requestDate, fee: fee || 0, insurance: insurance || 0, other_charges: other_charges || 0, frequency_id, branch_id },
    token,
  );

