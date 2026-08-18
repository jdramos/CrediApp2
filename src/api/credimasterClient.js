const BASE_URL = process.env.EXPO_PUBLIC_CREDIMASTER_API_URL;

// Cliente HTTP para el backend real de CrediMaster (Node/Express, JWT) —
// separado a propósito de apiClient.js (que sigue hablando con el
// backend PHP viejo para las pantallas todavía no migradas). Una vez que
// Dashboard/Pagos/Solicitudes/Aprobaciones se migren, apiClient.js se
// puede retirar.
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
    const message = data?.message || `Error HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const credimasterGet = (path, token) => request("GET", path, { token });
export const credimasterPost = (path, body, token) => request("POST", path, { body, token });
export const credimasterPut = (path, body, token) => request("PUT", path, { body, token });
