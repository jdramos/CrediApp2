import { toNumber } from "./format";

const n = (v) => Number(v) || 0;

// Resume la tabla de amortización que devuelve POST /api/loans/amortization.
// La fila 0 es el desembolso (todo en cero), las demás son las cuotas. La
// cuota ya incluye comisión, seguro y otros cargos prorrateados.
export function summarizeSchedule(table) {
  const rows = (table || []).filter((r) => Number(r.paymentNumber) > 0);
  if (!rows.length) return null;
  const sum = (key) => rows.reduce((acc, r) => acc + n(r[key]), 0);
  const principal = sum("principal");
  const interest = sum("interest");
  const charges = sum("feeByPayment") + sum("insuranceByPayment") + sum("otherChargesByPayment");
  return {
    rows,
    installments: rows.length,
    installment: n(rows[0].paymentAmount), // la última cuota puede variar por redondeo
    lastInstallment: n(rows[rows.length - 1].paymentAmount),
    principal,
    interest,
    charges,
    total: sum("paymentAmount"),
    firstDate: String(rows[0].paymentDate).slice(0, 10),
    lastDate: String(rows[rows.length - 1].paymentDate).slice(0, 10),
  };
}

// Avisos (no bloquean) cuando la simulación se sale de las políticas de
// crédito de la empresa; mismos criterios que la solicitud de crédito.
export function policyWarnings(policies, { amount, term, rate }) {
  const p = (key) => (policies?.[key] != null && policies[key] !== "" ? Number(policies[key]) : null);
  const out = [];
  if (p("max_amount") && amount > p("max_amount")) out.push(`El monto excede el máximo permitido: C$${p("max_amount")}`);
  if (p("min_amount") && amount < p("min_amount")) out.push(`El monto es menor al mínimo permitido: C$${p("min_amount")}`);
  if (p("max_term_months") && term > p("max_term_months")) out.push(`El plazo excede el máximo permitido: ${p("max_term_months")} meses`);
  if (p("min_term_months") && term < p("min_term_months")) out.push(`El plazo es menor al mínimo permitido: ${p("min_term_months")} meses`);
  if (p("max_interest_rate") && rate * 12 > p("max_interest_rate")) out.push(`La tasa anual excede lo permitido: ${p("max_interest_rate")}%`);
  if (p("min_interest_rate") && rate < p("min_interest_rate")) out.push(`La tasa es menor a la mínima permitida: ${p("min_interest_rate")}%`);
  return out;
}

// Convierte los campos de texto del formulario a números listos para enviar.
export function parseSimulationInput({ amount, term, rate, fee, insurance, otherCharges }) {
  return {
    amount: toNumber(amount),
    term: Number(term) || 0,
    rate: Number(String(rate).replace(",", ".")) || 0,
    fee: toNumber(fee),
    insurance: toNumber(insurance),
    otherCharges: toNumber(otherCharges),
  };
}
