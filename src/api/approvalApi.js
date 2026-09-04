import { credimasterGet, credimasterPut } from "./credimasterClient";

// Bandeja de aprobación del usuario actual (el backend identifica al
// aprobador por el token, no hace falta mandar el userId) — permiso
// aprobaciones.ver. Por defecto solo trae pendientes.
export const getApprovalInbox = (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return credimasterGet(`/api/approval-inbox${qs ? `?${qs}` : ""}`, token);
};

// Aprueba o rechaza una solicitud puntual (approval_id, no loan_id).
// Permiso aprobaciones.creditos.aprobar / aprobaciones.creditos.rechazar
// — el backend acepta cualquiera de los dos para este mismo endpoint,
// así que la distinción aprobar/rechazar la marca el `status` enviado,
// no el permiso; por eso la gateamos por separado del lado del cliente.
export const decideApproval = (token, approvalId, { status, amount, term, interest_rate, comment }) =>
  credimasterPut(`/api/approvals/${approvalId}`, { status, amount, term, interest_rate, comment }, token);

// Historial de aprobaciones de un crédito (quién, estado, fecha de
// decisión, comentario) — permiso aprobaciones.ver. Respuesta plana.
export const getLoanApprovalHistory = (token, loanId) =>
  credimasterGet(`/api/approvals/${loanId}`, token);
