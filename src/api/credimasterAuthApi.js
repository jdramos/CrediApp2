import { credimasterPost } from "./credimasterClient";

// Login real contra CrediMaster (POST /api/login). Devuelve un JWT
// (8h de vigencia) + el arreglo de permission_tag del usuario. El
// backend fuerza sesión única: este login invalida cualquier otra
// sesión activa de la misma cuenta (web u otro dispositivo).
// client_channel: la web y la app se contratan por separado; el backend solo
// deja entrar por la app a usuarios con "Acceso app móvil" (si no, responde
// 403 con el motivo en `message`).
export async function credimasterLoginRequest({ username, password, tenant_code, trusted_device_token }) {
  return credimasterPost("/api/login", { username, password, tenant_code, trusted_device_token, client_channel: "app" });
}

// Segundo paso cuando la empresa exige verificación en dos pasos: el login
// responde 401 con code "MFA_REQUIRED" y un `mfa_token`; ese token + el código
// de la app autenticadora (o un código de recuperación) dan la sesión.
// `remember_device` pide un token de "dispositivo de confianza".
export async function credimasterMfaVerify({ mfa_token, code, remember_device }) {
  return credimasterPost("/api/login/mfa/verify", { mfa_token, code, remember_device: !!remember_device, client_channel: "app" });
}
