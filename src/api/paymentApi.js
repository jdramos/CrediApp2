import { credimasterGet, credimasterPost } from "./credimasterClient";

// Formas de pago activas (efectivo, transferencia, etc.) — permiso
// pagos.ver.
export const getPaymentMethods = (token) => credimasterGet("/api/payments/formas-pago", token);

// Previsualiza cómo se va a aplicar un pago (capital/interés/seguro/
// mora) SIN guardar nada — permiso pagos.ver. Útil para mostrarle al
// cobrador el desglose antes de confirmar.
export const simulatePayment = (token, { loan_id, payment_date, payment_amount }) =>
  credimasterPost("/api/payments/simulate", { params: { loan_id, payment_date, payment_amount } }, token);

// Registra el pago real — permiso pagos.insertar. El backend espera los
// campos anidados bajo "params", no al nivel raíz.
export const createPayment = (token, params) =>
  credimasterPost("/api/payments", { params }, token);

// Historial de pagos ya registrados — permiso pagos.ver. `params` admite
// dateFrom/dateTo/branchId (query string tal cual, todos opcionales).
export const getPaymentHistory = (token, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return credimasterGet(`/api/payments${qs ? `?${qs}` : ""}`, token);
};
