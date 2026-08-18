// src/api/balancesApi.js
import { apiGet } from "./apiClient";

export async function fetchBalances(session) {
  return apiGet("saldos.php", {
    codOfi: session?.user?.codOfi,
    rol: session?.user?.rol,
    numSuc: session?.user?.numSuc,
    token: session?.token,
    deviceId: session?.deviceId,
  });
}