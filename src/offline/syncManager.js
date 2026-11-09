import { createPayment, recordUsdReceipt } from "../api/paymentApi";
import { uploadGuaranteePhoto } from "../api/guaranteePhotoApi";
import { uploadCustomerDocument } from "../api/customerDocumentApi";
import { saveCustomerLocation, saveCustomerInfoUpdate, createCustomer, searchCustomers } from "../api/customerApi";
import { createEvaluation } from "../api/customerEvaluationApi";
import { createLoanRequest } from "../api/loanApi";
import { logVisit } from "../api/collectionsApi";
import { uploadPaymentEvidence } from "../api/paymentEvidenceApi";
import { isNetworkError, setOfflineSyncMode } from "../api/credimasterClient";
import { listQueue, removeFromQueue, updateQueueItem, clearQueue } from "./queue";
import { deletePersistedFile } from "./filePersist";
import { isLocalCustomerId, getRealCustomerId, linkLocalCustomer, clearLocalCustomerMap } from "./localCustomers";

let syncing = false;

const normText = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
const normId = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase();

// Si el alta ya había llegado al servidor pero la respuesta se perdió (se cayó la señal justo
// ahí), reintentar da "cédula repetida" aunque el cliente sea el mismo. Se busca por cédula y
// solo se da por bueno si el nombre también coincide: un cliente distinto con la misma cédula
// sí debe quedar como error para que alguien lo revise.
async function findSameCustomer(token, customer) {
  const res = await searchCustomers(token, customer?.identification);
  const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  const found = list.filter(
    (c) =>
      normId(c.identification) === normId(customer?.identification) &&
      normText(c.customer_name) === normText(customer?.customer_name),
  );
  return found.length === 1 ? found[0].id : null;
}

// Solicitud de crédito guardada sin señal. Lleva su client_reference_id: si el servidor ya la había
// creado (respuesta perdida) devuelve esa misma solicitud en vez de crear otra. El cliente puede ser
// uno creado sin señal: su id real ya viene en payload.customerId (localCustomers.linkLocalCustomer).
// Si el servidor la rechaza (expediente incompleto, garantía, día cerrado...) queda como "Requiere
// atención" con el motivo; al corregirlo se puede reintentar desde Pendientes.
async function syncLoanRequest(token, item) {
  const { customerId, request } = item.payload;
  try {
    return await createLoanRequest(token, { ...request, customer_id: customerId });
  } catch (e) {
    const missing = e?.data?.missing_documents;
    if (e?.status && Array.isArray(missing) && missing.length) {
      const list = missing.map((d) => d.title || d.code).join(", ");
      throw Object.assign(new Error(`Expediente del cliente incompleto. Faltan: ${list}`), { status: e.status, data: e.data });
    }
    if (e?.status && e?.data?.code === "COLLATERAL_INSUFFICIENT") {
      throw Object.assign(new Error("La garantía no cubre el mínimo requerido para este monto."), { status: e.status, data: e.data });
    }
    throw e;
  }
}

// Alta de un cliente creado sin señal. Al lograrlo se enlaza el id local con el real, y los
// pendientes que dependían de él (evaluación, fotos) pasan a usar el id real.
async function syncCustomerCreate(token, item) {
  const { localId, body } = item.payload;
  let id;
  try {
    const res = await createCustomer(token, body);
    id = res?.data?.id ?? res?.id;
  } catch (e) {
    if (e?.status !== 409) throw e;
    id = await findSameCustomer(token, body?.customer);
    if (!id) throw e;
  }
  if (!id) throw new Error("El servidor no devolvió el id del cliente nuevo");
  await linkLocalCustomer(localId, id);
  return id;
}

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
    case "CUSTOMER_INFO_UPDATE":
      return saveCustomerInfoUpdate(token, item.payload.customerId, item.payload.payload);
    case "CUSTOMER_CREATE":
      return syncCustomerCreate(token, item);
    case "LOAN_REQUEST":
      return syncLoanRequest(token, item);
    case "CUSTOMER_EVALUATION":
      // El servidor calcula puntaje, riesgo y recomendación al recibirla, igual que en línea.
      return createEvaluation(token, { ...item.payload.evaluation, customer_id: Number(item.payload.customerId) });
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
  // Marca las llamadas como "envío de pendientes": el servidor las deja pasar aun fuera
  // del horario de uso de la app (lo cobrado sin señal no se pierde por la hora).
  setOfflineSyncMode(true);
  let synced = 0;
  let failed = 0;
  let waiting = 0;
  try {
    // Se recorren los ids y cada ítem se lee de nuevo justo antes de enviarlo: al registrarse un
    // cliente creado sin señal, los pendientes que dependen de él cambian de id local a real.
    const ids = (await listQueue()).filter((i) => i.status === "PENDING").map((i) => i.id);
    for (const id of ids) {
      let item = (await listQueue()).find((i) => i.id === id);
      if (!item || item.status !== "PENDING") continue;
      // Depende de un cliente que todavía no se registró (su alta sigue en espera o falló):
      // se deja pendiente, no es un error de este ítem.
      if (isLocalCustomerId(item.payload?.customerId)) {
        const real = await getRealCustomerId(item.payload.customerId);
        if (!real) {
          waiting += 1;
          continue;
        }
        item = { ...item, payload: { ...item.payload, customerId: real } };
      }
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
        // Fuera del horario de uso de la app: no es un error del ítem, se reintenta en el horario.
        if (e?.status === 403 && e?.data?.code === "OUTSIDE_SCHEDULE") {
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
    setOfflineSyncMode(false);
  }
  return { synced, failed, waiting };
}

// Reintento manual de un ítem marcado FAILED (botón "Reintentar" en la
// pantalla de pendientes).
export async function retryQueueItem(token, id) {
  await updateQueueItem(id, { status: "PENDING" });
  return flushQueue(token);
}

// Descarta los pendientes del usuario con sesión, con sus archivos locales de fotos/documentos.
// Ya NO se usa al cerrar sesión (ahí los pendientes se conservan a nombre de su dueño, ver
// queue.js y SessionContext.js::signOut); queda para una acción explícita del usuario.
export async function discardQueue() {
  const items = await listQueue();
  for (const item of items) {
    if (item.payload?.file?.uri) {
      await deletePersistedFile(item.payload.file.uri);
    }
  }
  await clearQueue();
  await clearLocalCustomerMap();
}
