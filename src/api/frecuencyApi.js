import { credimasterGet } from "./credimasterClient";

// Frecuencias de pago (mensual, quincenal, vencimiento único, etc.) —
// permiso catalogos.ver. Respuesta plana: [{id, name, tag, month_days}].
// El "tag" (ej. "M", "Q", "V") es lo que el backend guarda en
// loans_data.frequency; el "id" numérico se reutiliza como
// id_periodo_cobro_interes/id_periodo_cobro_principal (así lo hace la web).
export const getFrecuencies = (token) => credimasterGet("/api/frecuencies", token);
