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

// Cliente HTTP para el backend real de CrediMaster (Node/Express, JWT).
async function request(method, path, { body, token } = {}) {
  if (!BASE_URL) throw new Error("Falta EXPO_PUBLIC_CREDIMASTER_API_URL en .env");

  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON (HTML de error, etc.) — se maneja abajo
  }

  if (!response.ok) {
    checkUnauthorized(response.status, !!token);
    // Algunos controladores del backend responden { error } (aprobaciones, por
    // ejemplo) y otros { message }: se muestra el motivo real en cualquier caso.
    const message = data?.message || data?.error || `Error HTTP ${response.status}`;
    const err = new Error(message);
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

  const headers = {};
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

  const response =
    Platform.OS === "web"
      ? await fetch(`${BASE_URL}${path}`, { method, headers, body: formData })
      : await nativeMultipartSend(`${BASE_URL}${path}`, method, headers, formData);

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON
  }

  if (!response.ok) {
    checkUnauthorized(response.status, !!token);
    // Algunos controladores del backend responden { error } (aprobaciones, por
    // ejemplo) y otros { message }: se muestra el motivo real en cualquier caso.
    const message = data?.message || data?.error || `Error HTTP ${response.status}`;
    const err = new Error(message);
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
