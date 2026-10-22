import { credimasterPost } from "./credimasterClient";

// Login real contra CrediMaster (POST /api/login). Devuelve un JWT
// (8h de vigencia) + el arreglo de permission_tag del usuario. El
// backend fuerza sesión única: este login invalida cualquier otra
// sesión activa de la misma cuenta (web u otro dispositivo).
export async function credimasterLoginRequest({ username, password, tenant_code, trusted_device_token }) {
  return credimasterPost("/api/login", { username, password, tenant_code, trusted_device_token });
}

// Segundo paso cuando la empresa exige verificación en dos pasos: el login
// responde 401 con code "MFA_REQUIRED" y un `mfa_token`; ese token + el código
// de la app autenticadora (o un código de recuperación) dan la sesión.
// `remember_device` pide un token de "dispositivo de confianza".
export async function credimasterMfaVerify({ mfa_token, code, remember_device }) {
  return credimasterPost("/api/login/mfa/verify", { mfa_token, code, remember_device: !!remember_device });
}
