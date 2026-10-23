import { createPayment, recordUsdReceipt } from "../api/paymentApi";
import { uploadGuaranteePhoto } from "../api/guaranteePhotoApi";
import { uploadCustomerDocument } from "../api/customerDocumentApi";
import { saveCustomerLocation } from "../api/customerApi";
import { logVisit } from "../api/collectionsApi";
import { uploadPaymentEvidence } from "../api/paymentEvidenceApi";
import { isNetworkError } from "../api/credimasterClient";
import { listQueue, removeFromQueue, updateQueueItem, clearQueue } from "./queue";
import { deletePersistedFile } from "./filePersist";

let syncing = false;

function processItem(token, item) {
  switch (item.type) {
    case "PAYMENT": {
      // Un cobro en dólares trae `usd` {foreign_amount, fx_rate}: primero se registra el
      // pago (en C$) y luego se asientan los dólares. Si la segunda parte falla por
      // red, el ítem sigue en la cola y al reintentar el pago no se duplica (se
      // identifica por client_reference_id) y los dólares se asientan una sola vez.
      const { usd, ...params } = item.payload;
      return createPayment(token, params).then((res) =>
        usd ? recordUsdReceipt(token, { client_reference_id: params.client_reference_id, ...usd }).then(() => res) : res,
      );
    }
    case "PAYMENT_USD":
      // Dólares de un pago que sí se registró en línea pero cuyo asiento no llegó.
      return recordUsdReceipt(token, item.payload);
    case "GUARANTEE_PHOTO":
      return uploadGuaranteePhoto(token, item.payload.guaranteeId, item.payload.file);
    case "CUSTOMER_DOCUMENT":
      return uploadCustomerDocument(token, item.payload.customerId, item.payload.file, item.payload.options);
    case "CUSTOMER_LOCATION":
      return saveCustomerLocation(token, item.payload.customerId, item.payload.fullCustomer, item.payload.location);
    case "VISIT":
      return logVisit(token, item.payload);
    case "PAYMENT_EVIDENCE":
      // Se encola DESPUÉS del pago (misma cola, en orden), identificada por el
      // client_reference_id del pago o por su payment_id si ya estaba registrado.
      return uploadPaymentEvidence(token, item.payload);
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
