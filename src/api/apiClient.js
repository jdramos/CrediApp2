const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

function buildUrl(endpoint, params = {}) {
  const url = new URL(endpoint, BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, String(value));
    }
  });

  return url.toString();
}

export async function apiGet(endpoint, params = {}) {
  if (!BASE_URL) throw new Error("Falta EXPO_PUBLIC_API_BASE_URL en .env");

  const url = buildUrl(endpoint, params);
  console.log("🌐 GET:", url);

  const response = await fetch(url);
  const text = await response.text();

  // ✅ Log útil
  console.log("HTTP:", response.status, response.statusText);
  console.log("RAW (first 300):", text.slice(0, 300));

  // Si no es OK, lanza error con el body
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    // ✅ aquí verás si es HTML, warning PHP, etc.
    throw new Error(`Respuesta no JSON: ${text.slice(0, 200)}`);
  }
}