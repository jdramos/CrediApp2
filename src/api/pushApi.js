import { credimasterPost } from "./credimasterClient";

// credimasterClient no expone DELETE con body — se arma la llamada directa
// acá en vez de tocar el cliente compartido por un solo caso de uso.
const BASE_URL = process.env.EXPO_PUBLIC_CREDIMASTER_API_URL;

export const registerPushToken = (token, deviceToken, platform) =>
  credimasterPost("/api/push/register", { token: deviceToken, platform }, token);

export const unregisterPushToken = (token, deviceToken) =>
  fetch(`${BASE_URL}/api/push/register`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: deviceToken }),
  }).catch(() => {});
