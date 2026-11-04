// Cálculo del arqueo del día en el teléfono: espejo de evaluateCount del servidor
// (api/collections/collectorDayCloseController.js), que es quien decide. Sirve para
// mostrar en vivo si cuadra, cuánto cubren los dólares y qué falta, antes de guardar.
//
// Cada moneda se compara con lo esperado, contando lo depositado en el banco como
// efectivo entregado. Los US$ que sobran cubren el faltante en C$ al tipo de cambio
// de COMPRA de la institución; un faltante en US$ no se cubre con córdobas.
export const TOLERANCE = 0.005;

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// "1,250.50" / "1250.5" / "" -> número (NaN si no es un monto válido; "" -> 0).
export function parseAmountInput(text) {
  const clean = String(text ?? "").replace(/[\s,]/g, "");
  if (clean === "") return 0;
  const n = Number(clean);
  if (!Number.isFinite(n) || n < 0 || Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return NaN;
  return round2(n);
}

export function evaluateDayClose({ expectedNio, expectedUsd }, { countedNio, countedUsd, depositNio = 0, depositUsd = 0 }, rate = null) {
  let differenceNio = round2(countedNio + depositNio - expectedNio);
  let differenceUsd = round2(countedUsd + depositUsd - expectedUsd);
  const fxRate = Number(rate) || 0;
  let usdApplied = 0;
  let usdAppliedNio = 0;
  const usdCouldCover = differenceNio < -TOLERANCE && differenceUsd > TOLERANCE;
  const needsRate = usdCouldCover && !(fxRate > 0);
  if (usdCouldCover && fxRate > 0) {
    const neededUsd = Math.ceil((-differenceNio / fxRate) * 100 - 1e-9) / 100;
    usdApplied = round2(Math.min(differenceUsd, neededUsd));
    usdAppliedNio = round2(usdApplied * fxRate);
    differenceNio = round2(differenceNio + usdAppliedNio);
    differenceUsd = round2(differenceUsd - usdApplied);
  }
  return {
    differenceNio,
    differenceUsd,
    usdApplied,
    usdAppliedNio,
    needsRate,
    shortage: differenceNio < -TOLERANCE || differenceUsd < -TOLERANCE,
  };
}
