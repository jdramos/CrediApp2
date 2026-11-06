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

// Nº de recibo: es el id del pago (único y consecutivo en la empresa), con 6
// cifras: 5366 -> "005366". Es el mismo número que el ID de la lista de pagos
// de la plataforma web, así la oficina lo encuentra directo. Un pago guardado
// sin conexión no lo tiene hasta que se sincroniza.
export function formatReceiptNumber(id) {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)).padStart(6, "0") : "";
}
