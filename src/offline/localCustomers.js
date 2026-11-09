import AsyncStorage from "@react-native-async-storage/async-storage";
import { listQueue, mutateQueue } from "./queue";

// Clientes creados SIN señal. El cliente todavía no existe en el servidor, así que no tiene
// id real: se le da un id local ("local:...") y todo lo que se le agrega mientras tanto
// (evaluación, fotos) queda en la cola apuntando a ese id. Cuando el cliente se registra
// (syncManager.js, tipo CUSTOMER_CREATE) se guarda aquí la equivalencia local -> real y se
// reescriben los pendientes que lo mencionaban, para que se envíen con el id verdadero.

const MAP_KEY = "OFFLINE_CUSTOMER_MAP_V1";
const PREFIX = "local:";

export const isLocalCustomerId = (id) => typeof id === "string" && id.startsWith(PREFIX);

export const newLocalCustomerId = () =>
  `${PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function readMap() {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Id real de un cliente creado sin señal, o null si todavía no se registró.
export async function getRealCustomerId(localId) {
  const real = (await readMap())[localId];
  return real ? Number(real) : null;
}

// El cliente ya se registró con `realId`: se guarda la equivalencia y se actualizan los
// pendientes que dependían del id local.
export async function linkLocalCustomer(localId, realId) {
  const map = await readMap();
  map[localId] = Number(realId);
  await AsyncStorage.setItem(MAP_KEY, JSON.stringify(map));
  await mutateQueue((items) =>
    items.map((i) => (i.payload?.customerId === localId ? { ...i, payload: { ...i.payload, customerId: Number(realId) } } : i)),
  );
}

export async function clearLocalCustomerMap() {
  try {
    await AsyncStorage.removeItem(MAP_KEY);
  } catch {
    // best-effort
  }
}

// El id que se debe usar ahora: el real si el cliente ya se registró, si no el mismo.
export async function resolveCustomerId(id) {
  if (!isLocalCustomerId(id)) return id;
  return (await getRealCustomerId(id)) ?? id;
}

// Pendiente de alta de este cliente local (o undefined si ya se envió).
export async function getQueuedCustomerCreate(localId) {
  return (await listQueue()).find((i) => i.type === "CUSTOMER_CREATE" && i.payload?.localId === localId);
}

// Datos del cliente tal como se escribieron en el formulario (campos de `customer`).
export async function getQueuedCustomerFields(localId) {
  return (await getQueuedCustomerCreate(localId))?.payload?.body?.customer || null;
}

// Cambia campos del cliente que está esperando en la cola (la ubicación, por ejemplo).
// Devuelve false si el alta ya salió de la cola (se envió mientras tanto).
export async function patchQueuedCustomer(localId, fields) {
  let found = false;
  await mutateQueue((items) =>
    items.map((i) => {
      if (i.type !== "CUSTOMER_CREATE" || i.payload?.localId !== localId) return i;
      found = true;
      const body = i.payload.body || {};
      return { ...i, payload: { ...i.payload, body: { ...body, customer: { ...(body.customer || {}), ...fields } } } };
    }),
  );
  return found;
}

// Evaluación financiera de este cliente que espera en la cola (id local o real).
export async function getQueuedEvaluation(customerId) {
  return (await listQueue()).find((i) => i.type === "CUSTOMER_EVALUATION" && String(i.payload?.customerId) === String(customerId));
}

// ¿Hay un alta pendiente de un cliente con esta identificación? (para no encolar dos veces la misma cédula)
export async function hasQueuedCustomerWithIdentification(identification) {
  const norm = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase();
  const target = norm(identification);
  if (!target) return false;
  return (await listQueue()).some(
    (i) => i.type === "CUSTOMER_CREATE" && i.status === "PENDING" && norm(i.payload?.body?.customer?.identification) === target,
  );
}
