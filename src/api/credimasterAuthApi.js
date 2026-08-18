import { credimasterPost } from "./credimasterClient";

// Login real contra CrediMaster (POST /api/login). Devuelve un JWT
// (8h de vigencia) + el arreglo de permission_tag del usuario. El
// backend fuerza sesión única: este login invalida cualquier otra
// sesión activa de la misma cuenta (web u otro dispositivo).
export async function credimasterLoginRequest({ username, password, tenant_code }) {
  return credimasterPost("/api/login", { username, password, tenant_code });
}
