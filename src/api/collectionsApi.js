import { credimasterGet, credimasterPost } from "./credimasterClient";

// Cartera de créditos asignada al cobrador vinculado al usuario logueado
// (users.collector_id) — permiso pagos.ver. Si el usuario no está
// vinculado a ningún cobrador, la respuesta trae data: [] y un mensaje.
export const getAssignedLoans = (token, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return credimasterGet(`/api/collections/assigned${qs ? `?${qs}` : ""}`, token);
};

// Registra una gestión de cobranza (bitácora real, tabla
// collection_actions) — permiso cobranza.gestionar. Mismos campos y mismos
// códigos (action_type/result/stage) que la bitácora web
// (CollectionsWorklist.jsx), para que una gestión registrada desde el
// celular se vea igual en los dos lados.
// `action_date` es opcional (default: hoy) para poder fijarlo al momento
// real de la gestión cuando se encola sin conexión y se sincroniza horas
// después — ver ClientPortfolioScreen.js::saveGestion y
// offline/syncManager.js.
// `visit_lat`/`visit_lng` son opcionales (si el cobrador negó el permiso de
// ubicación, el backend igual registra la gestión sin coordenadas) — el
// backend las compara contra la casa/negocio guardados del cliente para
// poder verificar si realmente estuvo ahí.
export const logVisit = (
  token,
  { loan_id, action_type, action_date, result, stage, notes, promised_amount, promised_date, next_action_date, visit_lat, visit_lng } = {},
) =>
  credimasterPost(
    "/api/collections/actions",
    {
      loan_id,
      action_type: action_type || "VISIT",
      action_date: action_date || new Date().toISOString().slice(0, 10),
      result: result || undefined,
      stage: stage || "PREVENTIVE",
      notes: notes || undefined,
      promised_amount: promised_amount || undefined,
      promised_date: promised_date || undefined,
      next_action_date: next_action_date || undefined,
      visit_lat,
      visit_lng,
    },
    token,
  );

// Vista de supervisor: ranking de cobradores de MIS sucursales (cobrado vs
// meta, mora, riesgo, visitas) — permiso creditos.productividad.ver.
// `period`: today | week | month (default month).
export const getTeamProductivity = (token, { period, branch_id } = {}) => {
  const qs = new URLSearchParams(
    Object.entries({ period, branch_id }).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return credimasterGet(`/api/collections/team-productivity${qs ? `?${qs}` : ""}`, token);
};

// Detalle de un cobrador (vista de supervisor): créditos en mora con su
// categoría, visitas con verificación GPS y pagos del período — mismo
// permiso y alcance de sucursales que getTeamProductivity.
export const getTeamCollectorDetail = (token, collectorId, period) =>
  credimasterGet(`/api/collections/team-productivity/${collectorId}${period ? `?period=${period}` : ""}`, token);

// Cierre del día del cobrador (cobrado por forma de pago, efectivo a
// entregar, custodia acumulada) — permiso pagos.ver. `date` YYYY-MM-DD,
// opcional (default hoy).
export const getMyDayClose = (token, date) =>
  credimasterGet(`/api/collections/my-day-close${date ? `?date=${date}` : ""}`, token);

// Cuotas que vencen y promesas por día, de hoy a hoy+N: alimenta los
// recordatorios locales (notifications/reminders.js) — permiso pagos.ver.
export const getMyReminders = (token, days = 7) =>
  credimasterGet(`/api/collections/my-reminders?days=${days}`, token);

// Historial de gestiones de un crédito de MI cartera, con el estado de
// verificación GPS de cada visita — permiso pagos.ver (no cobranza.ver).
export const getMyLoanActions = (token, loanId) =>
  credimasterGet(`/api/collections/my-loans/${loanId}/actions`, token);

// "Mi productividad": resumen de la cartera del cobrador vinculado al usuario
// logueado (saldo, mora, vencidos, PAR, cobrado del día/mes, gestiones) —
// permiso pagos.ver, mismo alcance que getAssignedLoans. Si el usuario no
// está vinculado a un cobrador, la respuesta trae linked: false.
export const getMyProductivity = (token) =>
  credimasterGet("/api/collections/my-productivity", token);

// "Mis cobros": los pagos que registró el cobrador vinculado al usuario en un
// rango (from/to YYYY-MM-DD, default hoy), con resumen del rango completo
// (total, capital/interés, por forma de pago) y paginación (page/pageSize) —
// permiso pagos.ver.
export const getMyPayments = (token, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return credimasterGet(`/api/collections/my-payments${qs ? `?${qs}` : ""}`, token);
};

