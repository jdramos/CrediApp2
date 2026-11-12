import { Platform } from "react-native";

const BASE_URL = process.env.EXPO_PUBLIC_CREDIMASTER_API_URL;

// El backend responde 401 SOLO por token ausente/inválido/vencido
// (middleware/auth.js::verifyToken) -- nunca por falta de un permiso
// puntual, eso es 403. Por eso un 401 en una petición que SÍ llevaba
// token es siempre "la sesión ya no sirve", y amerita forzar logout en
// vez de mostrar el mensaje crudo del backend en la pantalla que
// disparó la llamada. `onUnauthorized` lo registra SessionContext al
// montar la app (necesita disparar signOut(), que vive en un
// componente React, así que este módulo plano no puede hacerlo solo).
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

function checkUnauthorized(status, hadToken) {
  if (status === 401 && hadToken) onUnauthorized?.();
}

// Fuera del horario de uso de la app (se configura en la web) el servidor responde
// 403 con code OUTSIDE_SCHEDULE; ScheduleGate registra aquí qué hacer (tapar la app
// con el aviso). Es un 403 como cualquier otro para quien llamó: el error sigue su camino.
let onOutsideSchedule = null;
export function setOutsideScheduleHandler(fn) {
  onOutsideSchedule = fn;
}
function checkOutsideSchedule(status, data) {
  if (status === 403 && data?.code === "OUTSIDE_SCHEDULE") onOutsideSchedule?.(data);
}

// Contraseña temporal sin cambiar (users.must_change_password): el servidor responde 403
// con code PASSWORD_CHANGE_REQUIRED a todo salvo el cambio de contraseña y el cierre de
// sesión. SessionContext registra aquí qué hacer (marcar la sesión para que la app muestre
// la pantalla obligatoria), por ejemplo con una sesión guardada de antes de esta versión.
let onPasswordChangeRequired = null;
export function setPasswordChangeRequiredHandler(fn) {
  onPasswordChangeRequired = fn;
}
function checkPasswordChangeRequired(status, data) {
  if (status === 403 && data?.code === "PASSWORD_CHANGE_REQUIRED") onPasswordChangeRequired?.(data);
}

// Identifica a la app ante el servidor (el horario de uso solo aplica a la app, no a
// la web) y marca el envío de lo pendiente sin señal, que se permite fuera de horario.
let offlineSyncMode = false;
export function setOfflineSyncMode(on) {
  offlineSyncMode = !!on;
}
function appHeaders(headers) {
  headers["X-Client-App"] = "crediapp";
  if (offlineSyncMode) headers["X-Offline-Sync"] = "1";
  return headers;
}

// Mensajes para el cobrador (2026-11-11). Sin señal, fetch lanza "Network request failed" y muchas pantallas
// mostraban ese texto técnico tal cual. Aquí se convierte UNA vez, para todas las pantallas: el error sigue sin
// `.status`, así que isNetworkError lo sigue reconociendo y las acciones se siguen encolando igual.
export const MSG_NO_CONNECTION =
  "No hay conexión con el servidor. Revise su internet o la señal del teléfono e intente de nuevo.";
export const MSG_SLOW_CONNECTION =
  "La conexión es muy lenta y no se pudo completar. Intente de nuevo cuando tenga mejor señal.";
const MSG_SERVER_DOWN = "El servidor no está disponible en este momento. Intente de nuevo en unos minutos.";

function networkFailure(original) {
  const raw = String(original?.message || original || "");
  const err = new TypeError(/timed out|timeout/i.test(raw) ? MSG_SLOW_CONNECTION : MSG_NO_CONNECTION);
  err.original = raw; // el texto técnico queda disponible para el registro de errores
  return err; // sin .status: es un fallo de red, no una respuesta del servidor
}

// Texto del error HTTP cuando el servidor no mandó uno propio (por ejemplo, la página de error de un proxy).
function httpErrorMessage(status, data) {
  const own = data?.message || data?.error;
  if (own) return own;
  if (status === 408 || status === 504) return MSG_SLOW_CONNECTION;
  if (status >= 500) return MSG_SERVER_DOWN;
  return `No se pudo completar la operación (código ${status}).`;
}

// Cliente HTTP para el backend real de CrediMaster (Node/Express, JWT).
async function request(method, path, { body, token } = {}) {
  if (!BASE_URL) throw new Error("Falta EXPO_PUBLIC_CREDIMASTER_API_URL en .env");

  const headers = appHeaders({ "Content-Type": "application/json" });
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw networkFailure(e);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON (HTML de error, etc.) — se maneja abajo
  }

  if (!response.ok) {
    checkUnauthorized(response.status, !!token);
    checkOutsideSchedule(response.status, data);
    checkPasswordChangeRequired(response.status, data);
    // Algunos controladores del backend responden { error } (aprobaciones, por
    // ejemplo) y otros { message }: se muestra el motivo real en cualquier caso.
    const err = new Error(httpErrorMessage(response.status, data));
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Un fetch que nunca llegó a tocar el servidor (sin señal, DNS caído,
// timeout de red) lanza un error SIN `.status` -- a diferencia de un
// error HTTP real (4xx/5xx), que siempre lo trae (ver arriba). Solo el
// primer caso amerita encolar la acción para reintentar después; un
// error HTTP real es una respuesta válida del servidor y debe mostrarse
// tal cual, nunca encolarse.
export function isNetworkError(err) {
  return !!err && err.status === undefined;
}

export const credimasterGet = (path, token) => request("GET", path, { token });
export const credimasterPost = (path, body, token) => request("POST", path, { body, token });
export const credimasterPut = (path, body, token) => request("PUT", path, { body, token });

// Subida de archivos (multipart/form-data) — NO fijar Content-Type a mano,
// fetch de React Native arma el boundary solo si se lo dejamos.
export async function credimasterUpload(path, formData, token, method = "POST") {
  if (!BASE_URL) throw new Error("Falta EXPO_PUBLIC_CREDIMASTER_API_URL en .env");

  const headers = appHeaders({});
  if (token) headers.Authorization = `Bearer ${token}`;

  // Web: convierte el archivo anotado por buildImageFormData en un Blob real.
  if (formData?.__webFile) {
    const { fieldName, file } = formData.__webFile;
    const blob = await (await fetch(file.uri)).blob();
    formData.append(fieldName, new Blob([blob], { type: file.type || blob.type }), file.name);
  }

  // Web, varias fotos (buildImagesFormData).
  if (formData?.__webFiles) {
    const { fieldName, files } = formData.__webFiles;
    for (const file of files) {
      const blob = await (await fetch(file.uri)).blob();
      formData.append(fieldName, new Blob([blob], { type: file.type || blob.type }), file.name);
    }
  }

  let response;
  try {
    response =
      Platform.OS === "web"
        ? await fetch(`${BASE_URL}${path}`, { method, headers, body: formData })
        : await nativeMultipartSend(`${BASE_URL}${path}`, method, headers, formData);
  } catch (e) {
    throw networkFailure(e);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON
  }

  if (!response.ok) {
    checkUnauthorized(response.status, !!token);
    checkOutsideSchedule(response.status, data);
    checkPasswordChangeRequired(response.status, data);
    // Algunos controladores del backend responden { error } (aprobaciones, por
    // ejemplo) y otros { message }: se muestra el motivo real en cualquier caso.
    const err = new Error(httpErrorMessage(response.status, data));
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// En el celular el fetch global es el de Expo (SDK 53+), que no acepta archivos
// del tipo { uri, name, type } dentro del FormData y falla con "Unsupported
// FormDataPart implementation" (3-nov-2026, confirmar entrega con fotos).
// XMLHttpRequest sí los sube leyéndolos del equipo. Un fallo de red lanza un
// error sin `status`, igual que fetch, para que isNetworkError lo reconozca.
function nativeMultipartSend(url, method, headers, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.timeout = 120000;
    xhr.onload = () =>
      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        text: async () => xhr.responseText ?? "",
      });
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new TypeError("Network request timed out"));
    xhr.send(formData);
  });
}
