import { credimasterGet } from "./credimasterClient";

// Estado del día operativo de una sucursal (permiso dia.ver) — el backend
// bloquea POST /api/payments y POST /api/loans con HTTP 423 si el día de
// hoy no está abierto o si el día anterior quedó sin cerrar (ver
// middleware/businessDay.js::requireOpenBusinessDay). Esto deja consultar
// ese mismo estado ANTES de intentar la operación, para avisar al
// cobrador de entrada en vez de que se entere recién al fallar el envío.
export const getBusinessDayStatus = (token, branchId) =>
  credimasterGet(`/api/business-day/status/${branchId}`, token);
