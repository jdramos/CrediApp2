import { createPayment } from "../api/paymentApi";
import { uploadGuaranteePhoto } from "../api/guaranteePhotoApi";
import { uploadCustomerDocument } from "../api/customerDocumentApi";
import { saveCustomerLocation } from "../api/customerApi";
import { logVisit } from "../api/collectionsApi";
import { isNetworkError } from "../api/credimasterClient";
import { listQueue, removeFromQueue, updateQueueItem, clearQueue } from "./queue";
import { deletePersistedFile } from "./filePersist";

let syncing = false;

function processItem(token, item) {
  switch (item.type) {
    case "PAYMENT":
      return createPayment(token, item.payload);
    case "GUARANTEE_PHOTO":
      return uploadGuaranteePhoto(token, item.payload.guaranteeId, item.payload.file);
    case "CUSTOMER_DOCUMENT":
      return uploadCustomerDocument(token, item.payload.customerId, item.payload.file, item.payload.options);
    case "CUSTOMER_LOCATION":
      return saveCustomerLocation(token, item.payload.customerId, item.payload.fullCustomer, item.payload.location);
    case "VISIT":
      return logVisit(token, item.payload);
    default:
      return Promise.reject(new Error(`Tipo de acción pendiente desconocido: ${item.type}`));
  }
}

// Recorre la cola en orden y reintenta cada ítem con la MISMA llamada que
// usa la pantalla en línea. Un error de red detiene el recorrido (si ya
// no hay señal, los siguientes van a fallar igual); un error real del
// servidor (validación, etc.) saca el ítem de la cola activa y lo marca
// FAILED -- no se reintenta solo, requiere revisión manual del usuario
// desde la pantalla de pendientes.
export async function flushQueue(token, { onProgress } = {}) {
  if (syncing || !token) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const items = await listQueue();
    for (const item of items.filter((i) => i.status === "PENDING")) {
      try {
        await processItem(token, item);
        if (item.payload?.file?.uri) {
          await deletePersistedFile(item.payload.file.uri);
        }
        await removeFromQueue(item.id);
        synced += 1;
        onProgress?.({ item, ok: true });
      } catch (e) {
        if (isNetworkError(e)) {
          break;
        }
        failed += 1;
        await updateQueueItem(item.id, {
          status: "FAILED",
          attempts: (item.attempts || 0) + 1,
          lastError: e?.message || "Error desconocido",
        });
        onProgress?.({ item, ok: false, error: e });
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed };
}

// Reintento manual de un ítem marcado FAILED (botón "Reintentar" en la
// pantalla de pendientes).
export async function retryQueueItem(token, id) {
  await updateQueueItem(id, { status: "PENDING" });
  return flushQueue(token);
}

// Descarta TODA la cola pendiente, incluyendo los archivos locales de
// fotos/documentos en espera de subir (ver SessionContext.js::signOut —
// se usa al cerrar sesión con ítems sin sincronizar, para que no queden
// esperando para irse con el token de la siguiente persona que use el
// dispositivo).
export async function discardQueue() {
  const items = await listQueue();
  for (const item of items) {
    if (item.payload?.file?.uri) {
      await deletePersistedFile(item.payload.file.uri);
    }
  }
  await clearQueue();
}
