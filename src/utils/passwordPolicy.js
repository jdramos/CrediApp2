// Política de contraseñas (dueño, 2026-11-08): mínimo 8 caracteres, con
// letras, números y al menos un símbolo. Es la misma regla del servidor
// (credimaster-backend/utils/passwordPolicy.js), que es quien manda: aquí solo
// se avisa antes de enviar, igual que la web (credimaster-frontend/src/utils/passwordPolicy.js).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = "Mínimo 8 caracteres, con letras, números y al menos un símbolo (por ejemplo ! @ # $ %).";

const LETTER = /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]/;
const DIGIT = /\d/;
const SYMBOL = /[^A-Za-z0-9ÁÉÍÓÚÜáéíóúüÑñ\s]/;

// Mensaje del problema o null si la contraseña cumple. Con `userName` también
// avisa si la contiene (el servidor la rechaza igual).
export function passwordProblem(password, { userName = "" } = {}) {
  const value = typeof password === "string" ? password : "";
  if (value.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!LETTER.test(value) || !DIGIT.test(value) || !SYMBOL.test(value)) {
    return "La contraseña debe tener letras, números y al menos un símbolo (por ejemplo ! @ # $ %).";
  }
  const name = String(userName || "").trim().toLowerCase();
  if (name.length >= 4 && value.toLowerCase().includes(name)) {
    return "La contraseña no puede contener el nombre de usuario.";
  }
  return null;
}
