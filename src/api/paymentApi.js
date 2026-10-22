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

// Cuánto hay que pagar HOY para cancelar el crédito completo, con su desglose
// (capital, interés a hoy, mora, seguro, comisión, otros cargos). Usa dos
// simulaciones del servidor, sin guardar nada: la primera (monto simbólico)
// trae el saldo total y la segunda lo aplica como cancelación total. Solo sirve
// para la fecha de hoy y necesita que el día operativo esté abierto.
export async function getPayoff(token, loanId, date) {
  const friendly = (e) => {
    const msg = e?.data?.error || e?.message || "No se pudo calcular el saldo";
    if (/balance INITIAL/i.test(msg)) {
      return new Error("Todavía no se abrió el día operativo de hoy, así que no se puede calcular el saldo para cancelar.");
    }
    return new Error(msg);
  };
  try {
    const probe = await simulatePayment(token, { loan_id: loanId, payment_date: date, payment_amount: 0.01 });
    const total = Number(probe?.total_balance) || 0;
    if (total <= 0) throw new Error("Este crédito no tiene saldo pendiente.");
    const full = await simulatePayment(token, { loan_id: loanId, payment_date: date, payment_amount: total });
    return { total, applied: full?.applied || {}, isFullCancellation: !!full?.is_full_cancellation };
  } catch (e) {
    throw friendly(e);
  }
}
