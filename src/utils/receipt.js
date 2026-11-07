// Comprobante: a diferencia del desglose previo al pago, siempre muestra cuánto
// fue a capital y a interés (aunque sea 0) para que el cliente vea la
// aplicación del pago; el resto de conceptos solo si recibieron algo.
const RECEIPT_MAP = [
  ["principal", "Aplicado a capital", true],
  ["interest", "Aplicado a interés", true],
  ["default_interest", "Interés moratorio", false],
  ["insurance", "Seguro", false],
  ["fee", "Cargos", false],
  ["other", "Otros", false],
];

// `applied` = { principal, interest, default_interest, insurance, fee, other }.
export function buildReceiptRows(applied) {
  if (!applied) return [];
  return RECEIPT_MAP
    .filter(([key, , always]) => always || (applied[key] != null && Number(applied[key]) > 0))
    .map(([key, label]) => ({ label, value: Number(applied[key]) || 0 }));
}

// Crédito con interés flat: el comprobante no desglosa capital e interés; muestra
// saldo total anterior, pago y nuevo saldo total (dueño, 2026-11-06). Solo se
// aclara el interés moratorio, que no baja el saldo del plan.
export function buildFlatReceiptRows(applied) {
  return applied && Number(applied.default_interest) > 0
    ? [{ label: "Interés moratorio", value: Number(applied.default_interest) }]
    : [];
}

// Lo que el pago bajó del saldo total del plan flat (todo menos el moratorio).
export function planAppliedTotal(applied) {
  if (!applied) return 0;
  const sum = ["principal", "interest", "insurance", "fee", "other"].reduce((a, k) => a + (Number(applied[k]) || 0), 0);
  return Math.round(sum * 100) / 100;
}

// Saldo total ANTES del pago = el nuevo saldo + lo que el pago bajó del plan.
export function totalBalanceBefore(newBalance, applied) {
  if (newBalance == null || !Number.isFinite(Number(newBalance))) return null;
  return Math.round((Number(newBalance) + planAppliedTotal(applied)) * 100) / 100;
}

// Convierte una fila de "Mis cobros" (campos *_payment) a la forma `applied`.
export function appliedFromPaymentRow(p) {
  return {
    principal: p.principal_payment,
    interest: p.interest_payment,
    default_interest: p.defaulted_interest,
    insurance: p.insurance_payment,
    fee: p.fee_payment,
    other: p.other_charges_payment,
  };
}

// Detalle de las cuotas que cubrió el pago, una fila por cuota: número, lo que ESTE
// pago le aplicó y si quedó pagada o fue un abono, con los días de atraso con que se
// pagó (0 = a tiempo). `installments` viene del servidor.
export const lateText = (days) => {
  const d = Number(days) || 0;
  return d > 0 ? `${d} día${d === 1 ? "" : "s"} de atraso` : "";
};
export function installmentDetailRows(installments) {
  return (Array.isArray(installments) ? installments : []).map((i) => {
    const paid = !!i.paid;
    const late = lateText(i.days_late);
    const scheduled = Number(i.scheduled) || 0;
    return {
      key: String(i.n),
      label: `Cuota ${i.n}`,
      amount: Number(i.applied) || 0,
      paid,
      late: Number(i.days_late) > 0,
      status: paid
        ? late ? `Pagada con ${late}` : "Pagada a tiempo"
        : `Abono${late ? ` (${late})` : ""}`,
      scheduled,
    };
  });
}

// Nº de recibo: es el id del pago (único y consecutivo en la empresa), con 6
// cifras: 5366 -> "005366". Es el mismo número que el ID de la lista de pagos
// de la plataforma web, así la oficina lo encuentra directo. Un pago guardado
// sin conexión no lo tiene hasta que se sincroniza.
export function formatReceiptNumber(id) {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)).padStart(6, "0") : "";
}
