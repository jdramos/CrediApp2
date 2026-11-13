// Misma metodología que credimaster-backend/utils/tcea.js (la que usa la Hoja
// Resumen / Resumen Informativo): tasa anual que iguala a cero el valor
// presente del desembolso neto y de las cuotas, con las fechas reales del
// cronograma. Mantener ambos archivos sincronizados para que el TCEA mostrado
// al crear el crédito coincida con el del documento de transparencia.

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (a, b) => (new Date(b) - new Date(a)) / DAY_MS;

const npv = (rate, cashFlows, t0) =>
  cashFlows.reduce((acc, cf) => acc + cf.amount / Math.pow(1 + rate, daysBetween(t0, cf.date) / 365), 0);

export const calculateTCEA = (disbursedAmount, disbursementDate, installments) => {
  const amount = Number(disbursedAmount);
  if (!amount || amount <= 0 || !disbursementDate || !Array.isArray(installments) || !installments.length) {
    return null;
  }

  const cashFlows = [
    { date: disbursementDate, amount: -amount },
    ...installments
      .filter((i) => i.date && Number(i.amount) > 0)
      .map((i) => ({ date: i.date, amount: Number(i.amount) })),
  ];
  if (cashFlows.length < 2) return null;

  let low = -0.99;
  let high = 100;
  const t0 = disbursementDate;
  let npvLow = npv(low, cashFlows, t0);
  const npvHigh = npv(high, cashFlows, t0);

  if (Number.isNaN(npvLow) || Number.isNaN(npvHigh) || npvLow * npvHigh > 0) return null;

  let mid = 0;
  for (let i = 0; i < 100; i++) {
    mid = (low + high) / 2;
    const npvMid = npv(mid, cashFlows, t0);
    if (Math.abs(npvMid) < 0.0001) break;
    if (npvLow * npvMid < 0) {
      high = mid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return Math.round(mid * 10000) / 100;
};

// A partir de las filas de la tabla de amortización del asistente de
// crédito (paymentNumber/paymentDate/principal/interest/feeByPayment/...).
// La fila 0 es el ancla de desembolso (sin pago) y marca la fecha t0.
export const tceaFromAmortizationTable = (disbursedAmount, table = []) => {
  if (!table.length) return null;
  const anchor = table.find((r) => Number(r.paymentNumber) === 0);
  const disbursementDate = anchor?.paymentDate || table[0]?.paymentDate;

  const installments = table
    .filter((r) => Number(r.paymentNumber) > 0)
    .map((r) => ({
      date: r.paymentDate,
      amount:
        Number(r.principal || 0) +
        Number(r.interest || 0) +
        Number(r.feeByPayment || 0) +
        Number(r.insuranceByPayment || 0) +
        Number(r.otherChargesByPayment || 0),
    }));

  return calculateTCEA(disbursedAmount, disbursementDate, installments);
};
