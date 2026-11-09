import { prefetchCustomerCatalogs } from "../api/customerCatalogApi";
import { getAccessibleBranches } from "../api/branchApi";
import { getEvaluationFormOptions } from "../api/customerEvaluationApi";
import { cachedFetch } from "./cache";
import { loadPaymentMethods, prefetchPortfolio } from "./paymentData";

export const EVAL_OPTIONS_CACHE_KEY = "evalOptions";

// Con conexión, deja guardado lo que se va a necesitar sin señal según los permisos del usuario:
//  - cobrar: formas de pago + cartera (para buscar al cliente y elegir el crédito),
//  - cliente nuevo: catálogos del formulario + sucursales,
//  - evaluación financiera: conceptos y opciones de la empresa.
// Cada pieza es independiente y best-effort: si una falla (sin permiso, red caída) las demás siguen.
export async function prefetchOfflineData(token, userId, permissions = []) {
  const can = (p) => permissions.includes(p);
  const jobs = [];
  if (userId && (can("pagos.insertar") || can("pagos.ver"))) {
    jobs.push(loadPaymentMethods(token, userId), prefetchPortfolio(token, userId));
  }
  if (can("clientes.insertar")) {
    jobs.push(prefetchCustomerCatalogs(token), getAccessibleBranches(token));
  }
  if (can("clientes.evaluacion.insertar")) {
    jobs.push(cachedFetch(EVAL_OPTIONS_CACHE_KEY, () => getEvaluationFormOptions(token)));
  }
  await Promise.allSettled(jobs);
}
