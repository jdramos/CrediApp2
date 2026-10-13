import { credimasterGet } from "./credimasterClient";

// Cobradores con actividad HOY (pagos o gestiones) que no iniciaron su jornada
// ni enviaron ruta — permiso rastreo.ver, con el alcance de sucursales del
// usuario. Respuesta: { date, data: [{ user_id, user_name, branch_name,
// payments_count, actions_count }] }.
export const getMissingWorkdayToday = (token) => credimasterGet("/api/tracking/missing-today", token);

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();

// Quiénes registraron su ruta un día (y quiénes tuvieron actividad sin
// registrarla) — permiso rastreo.ver. `date` YYYY-MM-DD y `tz_offset` (minutos,
// el getTimezoneOffset() del teléfono) para que el "día" sea el local.
export const getTrackingDay = (token, { date, tz_offset }) =>
  credimasterGet(`/api/tracking/day?${qs({ date, tz_offset })}`, token);

// La ruta de UN usuario ese día: recorrido, paradas, visitas y pagos.
export const getTrackingUserDay = (token, userId, { date, tz_offset }) =>
  credimasterGet(`/api/tracking/day/${userId}?${qs({ date, tz_offset })}`, token);
