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
// collection_actions) — permiso cobranza.gestionar. action_type "VISIT"
// es el mismo valor que usa la bitácora web (CollectionsWorklist.jsx)
// para que se vea consistente desde ambos lados.
// `action_date` es opcional (default: hoy) para poder fijarlo al momento
// real de la visita cuando se encola sin conexión y se sincroniza horas
// después — ver ClientPortfolioScreen.js::markVisited y
// offline/syncManager.js.
// `visit_lat`/`visit_lng` son opcionales (si el cobrador negó el permiso de
// ubicación, el backend igual registra la visita sin coordenadas) — el
// backend las compara contra la casa/negocio guardados del cliente para
// poder verificar si realmente estuvo ahí.
export const logVisit = (token, { loan_id, notes, action_date, visit_lat, visit_lng } = {}) =>
  credimasterPost(
    "/api/collections/actions",
    {
      loan_id,
      action_type: "VISIT",
      action_date: action_date || new Date().toISOString().slice(0, 10),
      stage: "PREVENTIVE",
      notes: notes || undefined,
      visit_lat,
      visit_lng,
    },
    token,
  );
