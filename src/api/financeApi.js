import { credimasterGet } from "./credimasterClient";

// Módulos vigentes de la empresa ({ enabled_modules, module_package, ... }).
// enabled_modules null = todos (IMF regulada completa).
export const getSessionModules = (token) => credimasterGet("/api/session/modules", token);

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

// Cartera total y vencida por mes (últimos cierres de cada mes) — permiso
// balances.ver; `branch_id` opcional.
export const getPortfolioByMonth = (token, branch_id) =>
  credimasterGet(`/api/dashboard/balances-fast/portfolio-by-month${branch_id ? `?branch_id=${branch_id}` : ""}`, token);

// Tablero gerencial del período (permiso balances.ver): colocación con su meta,
// recuperación, clientes, saneados, tendencia de 12 meses y rankings, contra el
// mismo rango del mes anterior. `date_from`/`date_to` = YYYY-MM-DD.
export const getManagementDashboard = (token, { date_from, date_to, branch_id }) =>
  credimasterGet(
    `/api/dashboard/management?date_from=${date_from}&date_to=${date_to}${branch_id ? `&branch_id=${branch_id}` : ""}`,
    token,
  );

// ---- Presupuesto (permiso presupuesto.ver; módulo "budget" de la empresa).
// Lista de presupuestos (uno por año), seguimiento de un mes (cuentas con
// presupuestado y real del mes y del año, y colocación por sucursal) y alertas.
export const getBudgets = (token) => credimasterGet("/api/budget", token);
export const getBudgetTracking = (token, budgetId, month) =>
  credimasterGet(`/api/budget/${budgetId}/tracking?month=${month}`, token);
export const getBudgetAlerts = (token) => credimasterGet("/api/budget/alerts", token);
