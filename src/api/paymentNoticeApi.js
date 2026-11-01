import { credimasterGet, credimasterPost } from "./credimasterClient";

// ¿El SMS automático al grabar un pago está encendido para esta empresa?
// (política sms_pago_automatico; sin fila = sí) — permiso pagos.ver.
export const getNoticePolicy = (token) => credimasterGet("/api/payments/notices/policy", token);

// Reporta un aviso al cliente (automático o manual) para la bitácora y las alertas
// de fraude de la oficina — permiso pagos.insertar.
//   { kind: PAYMENT|REMINDER, channel: AUTO_SMS|MANUAL_SMS|MANUAL_WHATSAPP,
//     status: SENT|FAILED|NO_PHONE|OPENED, payment_id, loan_id, phone_to, message, error }
export const reportPaymentNotice = (token, payload) => credimasterPost("/api/payments/notices", payload, token);
