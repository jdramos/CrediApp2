import { credimasterGet } from "./credimasterClient";

// Cobradores con actividad HOY (pagos o gestiones) que no iniciaron su jornada
// ni enviaron ruta — permiso rastreo.ver, con el alcance de sucursales del
// usuario. Respuesta: { date, data: [{ user_id, user_name, branch_name,
// payments_count, actions_count }] }.
export const getMissingWorkdayToday = (token) => credimasterGet("/api/tracking/missing-today", token);
