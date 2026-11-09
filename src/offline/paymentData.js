import { getPaymentMethods } from "../api/paymentApi";
import { getAssignedLoans } from "../api/collectionsApi";
import { isNetworkError } from "../api/credimasterClient";
import { cachedFetch, readCache } from "./cache";

// Datos que el registro de un pago necesita ANTES de poder encolarlo: las formas de pago y los
// créditos del cobrador (para buscar al cliente y elegir el crédito). Sin señal salen de la
// última copia guardada (offline/cache.js): la cartera completa que se baja al abrir la app con
// conexión y las formas de pago.

export const portfolioCacheKey = (userId) => `${userId}:portfolio`;
const methodsCacheKey = (userId) => `${userId}:payMethods`;

// Si nunca se guardaron las formas de pago: "Efectivo", id 1 en conami_forma_pago (el mismo
// id que usa el backend para el efectivo del cobrador).
const FALLBACK_METHODS = [{ id: 1, name: "Efectivo" }];

// Formas de pago activas. Nunca falla por falta de red: devuelve la copia guardada o, si no hay,
// solo "Efectivo". Los errores reales del servidor (permiso, etc.) sí se propagan.
export async function loadPaymentMethods(token, userId) {
  try {
    const { data } = await cachedFetch(methodsCacheKey(userId), () => getPaymentMethods(token));
    const list = data?.data || [];
    return list.length ? list : FALLBACK_METHODS;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    return FALLBACK_METHODS;
  }
}

// Cartera guardada: créditos activos de la última vez que se bajó con conexión.
export async function loadCachedPortfolio(userId) {
  const cached = await readCache(portfolioCacheKey(userId));
  return Array.isArray(cached?.data?.data) ? cached.data.data : [];
}

// Sin tildes ni mayúsculas: "maria" encuentra a "María".
const lower = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Un crédito de la cartera con la forma que usa el registro de pagos.
export function loanFromPortfolio(item) {
  const balance = item.display_balance ?? item.principal_balance ?? 0;
  return {
    id: item.loan_id,
    loan_id: item.loan_id,
    credit_code: item.credit_code,
    branch_id: item.branch_id,
    branch_name: item.branch_name,
    customer_id: item.customer_id,
    display_balance: balance,
    current_balance: balance,
    days_overdue: item.days_overdue,
    overdue_installments: item.overdue_installments,
    overdue_amount: item.overdue_amount,
    oldest_overdue_date: item.oldest_due_date,
    next_installment_amount: item.installment_amount,
    next_payment_date: item.next_payment_date,
    fromCache: true,
  };
}

// Busca clientes dentro de la cartera guardada (nombre, cédula, código del crédito o del cliente).
export async function searchCachedCustomers(userId, text) {
  const q = lower(text).trim();
  if (!q) return [];
  const qCompact = q.replace(/[\s-]/g, "");
  const seen = new Map();
  for (const l of await loadCachedPortfolio(userId)) {
    if (!l.customer_id || seen.has(l.customer_id)) continue;
    // La cédula se encuentra con o sin guiones ("0012222..." o "001-2222...").
    const hit = [l.customer_name, l.customer_identification, l.credit_code, l.customer_code].some(
      (v) => lower(v).includes(q) || (qCompact && lower(v).replace(/[\s-]/g, "").includes(qCompact)),
    );
    if (!hit) continue;
    seen.set(l.customer_id, {
      id: l.customer_id,
      customer_name: l.customer_name,
      customer_code: l.customer_code,
      identification: l.customer_identification,
      home_address: l.home_address,
      business_address: l.business_address,
      cellphone: l.cellphone,
      telephone: l.telephone,
    });
  }
  return [...seen.values()];
}

// Créditos de un cliente dentro de la cartera guardada.
export async function cachedLoansOfCustomer(userId, customerId) {
  return (await loadCachedPortfolio(userId))
    .filter((l) => Number(l.customer_id) === Number(customerId))
    .map(loanFromPortfolio);
}

// Un crédito de la cartera guardada por su id (o undefined).
export async function cachedLoan(userId, loanId) {
  const item = (await loadCachedPortfolio(userId)).find((l) => Number(l.loan_id) === Number(loanId));
  return item ? loanFromPortfolio(item) : undefined;
}

// Deja guardada la cartera para poder cobrar sin señal aunque no se haya abierto esa pantalla.
export async function prefetchPortfolio(token, userId) {
  await cachedFetch(portfolioCacheKey(userId), () => getAssignedLoans(token));
}
