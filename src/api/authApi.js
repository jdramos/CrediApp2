import { apiGet } from "./apiClient";

/**
 * Login real contra PHP.
 * Endpoint esperado: /login.php
 * Respuesta: array con 1 registro de appusuario, o ["CODE"].
 */
export async function loginRequest({ nomUser, pasUser, token, deviceId }) {
  const data = await apiGet("validar_login.php", {
    nomUser,
    pasUser,
    token,
    deviceId,
  });

  // Casos de error: ["FALTAN_DATOS"] / ["USERNO"] / ["PASSNO"] / ["APPINACTIVA"] / ["SESSION_REPLACED"]...
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
    const code = data[0];
    const err = new Error(mapLoginError(code));
    err.code = code;
    throw err;
  }

  // Caso OK: array de objetos (normalmente 1)
  const user = Array.isArray(data) ? data[0] : null;
  if (!user) {
    const err = new Error("Respuesta inesperada del servidor");
    err.data = data;
    throw err;
  }

  return { user };
}

function mapLoginError(code) {
  switch (code) {
    case "FALTAN_DATOS":
      return "Faltan datos para iniciar sesión";
    case "USERNO":
      return "Usuario no existe o está inactivo";
    case "PASSNO":
      return "Contraseña incorrecta";
    case "APPINACTIVA":
      return "Acceso fuera de horario permitido";
    default:
      return `Error de login: ${code}`;
  }
}