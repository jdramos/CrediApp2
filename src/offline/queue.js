import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "OFFLINE_QUEUE_V1";

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readAll() {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeAll(items) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

// DUEÑO de cada pendiente. Al cerrar sesión (o si el servidor la cierra solo) la cola NO se
// borra: cada ítem lleva el id del usuario que lo creó, solo ese usuario lo ve y lo envía (con
// su propio token), y se queda en el teléfono hasta que vuelva a iniciar sesión. En un teléfono
// compartido, otra persona no ve ni envía lo ajeno. SessionContext fija el dueño al cambiar la
// sesión; sin sesión no hay dueño y la cola aparece vacía. Los ítems de antes de este cambio
// (sin dueño) se consideran del usuario que abra sesión.
let owner = null;
export function setQueueOwner(userId) {
  owner = userId == null ? null : String(userId);
}
const mine = (i) => owner !== null && (i.ownerId == null || String(i.ownerId) === owner);

// Toda lectura-modificación-escritura de la cola pasa por aquí, de a una. Sin esto,
// un envío en curso (que quita ítems) y el usuario encolando algo nuevo a la vez
// podían pisarse y perder un ítem: dos operaciones leían la misma lista y la última
// en escribir borraba el cambio de la otra.
let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// item: { type: 'PAYMENT'|'PAYMENT_USD'|'GUARANTEE_PHOTO'|'CUSTOMER_DOCUMENT'|'CUSTOMER_LOCATION'|
//   'CUSTOMER_INFO_UPDATE'|'CUSTOMER_CREATE'|'CUSTOMER_EVALUATION'|'VISIT'|'PAYMENT_EVIDENCE', payload, label }
// `label` es un texto corto para mostrar en la lista de pendientes.
export function enqueue(item) {
  return locked(async () => {
    const items = await readAll();
    const entry = {
      id: genId(),
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
      status: "PENDING", // PENDING | FAILED (requiere atención, no se reintenta solo)
      ownerId: owner,
      ...item,
    };
    items.push(entry);
    await writeAll(items);
    return entry;
  });
}

// Solo los pendientes del usuario con sesión.
export function listQueue() {
  return locked(async () => (await readAll()).filter(mine));
}

// Cuántos pendientes de OTROS usuarios guardados en este teléfono esperan a que esa persona vuelva a entrar.
export function countOtherOwnersQueue() {
  return locked(async () => (await readAll()).filter((i) => !mine(i)).length);
}

export function removeFromQueue(id) {
  return locked(async () => {
    const items = await readAll();
    await writeAll(items.filter((i) => i.id !== id));
  });
}

export function updateQueueItem(id, patch) {
  return locked(async () => {
    const items = await readAll();
    const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    await writeAll(next);
    return next.find((i) => i.id === id);
  });
}

// Reescribe la cola completa con `mapper(items) -> items` en una sola operación
// (usado para cambiar el cliente "local" por el real en los pendientes que dependen de él).
export function mutateQueue(mapper) {
  return locked(async () => {
    const next = mapper(await readAll());
    await writeAll(next);
    return next;
  });
}

export async function queueCount() {
  return (await listQueue()).length;
}

// Borra SOLO los pendientes del usuario con sesión (acción explícita suya; ya no se usa al
// cerrar sesión). Los archivos asociados (fotos/documentos) los limpia quien llama (syncManager.discardQueue).
export function clearQueue() {
  return locked(async () => writeAll((await readAll()).filter((i) => !mine(i))));
}
