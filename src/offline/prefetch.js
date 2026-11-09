import { prefetchCustomerCatalogs } from "../api/customerCatalogApi";
import { getAccessibleBranches } from "../api/branchApi";
import { getLoanCatalogs } from "../api/conamiApi";
import { getFrecuencies } from "../api/frecuencyApi";
import { getCreditPolicies } from "../api/creditPolicyApi";
import { getPromotersByBranch } from "../api/promoterApi";
import { getCollectorsByBranch } from "../api/collectorApi";
import { getEvaluationFormOptions } from "../api/customerEvaluationApi";
import { cachedFetch } from "./cache";
import { loadPaymentMethods, prefetchPortfolio, prefetchPayments } from "./paymentData";

export const EVAL_OPTIONS_CACHE_KEY = "evalOptions";

// Catálogos de la solicitud de crédito (frecuencias, políticas, catálogos CONAMI y, por sucursal,
// promotores y gestores).
async function prefetchLoanForm(token) {
  const branches = await getAccessibleBranches(token).catch(() => null);
  const ids = (branches?.data || []).map((b) => b.id);
  await Promise.allSettled([
    getFrecuencies(token),
    getCreditPolicies(token),
    getLoanCatalogs(token),
    ...ids.flatMap((id) => [getPromotersByBranch(token, id), getCollectorsByBranch(token, id)]),
  ]);
}

// Con conexión, deja guardado lo que se va a necesitar sin señal según los permisos del usuario:
//  - cobrar: formas de pago + cartera (para buscar al cliente y elegir el crédito) + los cobros
//    de los períodos de "Mis cobros",
//  - cliente nuevo: catálogos del formulario + sucursales,
//  - solicitud de crédito: catálogos del formulario (frecuencias, políticas, promotores, gestores),
//  - evaluación financiera: conceptos y opciones de la empresa.
// Cada pieza es independiente y best-effort: si una falla (sin permiso, red caída) las demás siguen.
export async function prefetchOfflineData(token, userId, permissions = []) {
  const can = (p) => permissions.includes(p);
  const jobs = [];
  if (userId && (can("pagos.insertar") || can("pagos.ver"))) {
    jobs.push(loadPaymentMethods(token, userId), prefetchPortfolio(token, userId), prefetchPayments(token, userId));
  }
  if (can("clientes.insertar")) {
    jobs.push(prefetchCustomerCatalogs(token), getAccessibleBranches(token));
  }
  if (can("creditos.insertar")) {
    jobs.push(prefetchLoanForm(token));
  }
  if (can("clientes.evaluacion.insertar")) {
    jobs.push(cachedFetch(EVAL_OPTIONS_CACHE_KEY, () => getEvaluationFormOptions(token)));
  }
  await Promise.allSettled(jobs);
}
