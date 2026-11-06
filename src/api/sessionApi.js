import { credimasterGet } from "./credimasterClient";

// Horario de uso de la app del usuario logueado y si ahora puede usarla
// ({ restricted, allowed, windows, today, next, message }). Está permitido aun
// fuera de horario.
export const getMyAppSchedule = (token) => credimasterGet("/api/session/app-schedule", token);
