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

// item: { type: 'PAYMENT'|'GUARANTEE_PHOTO'|'CUSTOMER_DOCUMENT'|'CUSTOMER_LOCATION'|'VISIT', payload, label }
// `label` es un texto corto para mostrar en la lista de pendientes.
export async function enqueue(item) {
  const items = await readAll();
  const entry = {
    id: genId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    status: "PENDING", // PENDING | FAILED (requiere atención, no se reintenta solo)
    ...item,
  };
  items.push(entry);
  await writeAll(items);
  return entry;
}

export async function listQueue() {
  return readAll();
}

export async function removeFromQueue(id) {
  const items = await readAll();
  await writeAll(items.filter((i) => i.id !== id));
}

export async function updateQueueItem(id, patch) {
  const items = await readAll();
  const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  await writeAll(next);
  return next.find((i) => i.id === id);
}

export async function queueCount() {
  return (await readAll()).length;
}

// Usado al cerrar sesión: en un dispositivo compartido entre cobradores,
// items sin sincronizar de un usuario NO deben quedar esperando para
// sincronizarse con el token del siguiente que inicie sesión ahí. Los
// archivos asociados (fotos/documentos) se limpian aparte por el
// llamador antes de invocar esto (ver SessionContext.js::signOut).
export async function clearQueue() {
  await writeAll([]);
}
