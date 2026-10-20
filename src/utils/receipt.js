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
