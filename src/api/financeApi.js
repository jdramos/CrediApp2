import { credimasterGet } from "./credimasterClient";

// ---- Saldos de cartera (permiso balances.ver; el servidor limita a las
// sucursales del usuario) -- último cierre diario de saldos.
export const getPortfolioSummary = (token, branch_id) =>
  credimasterGet(`/api/dashboard/balances-fast/summary${branch_id ? `?branch_id=${branch_id}` : ""}`, token);
export const getPortfolioAging = (token, branch_id) =>
  credimasterGet(`/api/dashboard/balances-fast/aging${branch_id ? `?branch_id=${branch_id}` : ""}`, token);
export const getPortfolioRisk = (token, branch_id) =>
  credimasterGet(`/api/dashboard/balances-fast/risk-breakdown${branch_id ? `?branch_id=${branch_id}` : ""}`, token);
export const getPortfolioByBranch = (token) => credimasterGet("/api/dashboard/balances-fast/portfolio-by-branch", token);

// ---- Indicadores financieros (permiso contabilidad.ver): los 28 indicadores del
// formato de la CONAMI con su análisis. `period` = YYYY-MM (sin él, el último
// mes con reporte del sector).
export const getFinancialIndicators = (token, period) =>
  credimasterGet(`/api/accounting/financial-indicators${period ? `?period=${period}` : ""}`, token);

// ---- Situación financiera (permiso contabilidad.ver): balance y resultados del
// mes con el mes anterior y el cierre del año anterior.
export const getFinancialPosition = (token, period) =>
  credimasterGet(`/api/accounting/financial-position${period ? `?period=${period}` : ""}`, token);
