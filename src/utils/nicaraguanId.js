// Cédula de identidad nicaragüense (tipo de documento 1): 14 caracteres
//   3 dígitos (municipio de emisión)
//   6 dígitos: fecha de nacimiento ddmmaa
//   4 dígitos (consecutivo)
//   1 letra
// p. ej. 0011501900002A. Mantener igual a utils/nicaraguanId.js del backend: el
// servidor la vuelve a validar al guardar al cliente.
const CEDULA_RE = /^(\d{3})(\d{2})(\d{2})(\d{2})(\d{4})([A-Za-z])$/;

export const FORMAT_MESSAGE =
  "La cédula debe tener 14 caracteres: 3 dígitos, 6 de la fecha de nacimiento (ddmmaa), 4 dígitos y una letra (p. ej. 0011501900002A).";

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (month, year) => [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

// { day, month, yy } de la cédula, o null si no tiene el formato.
export function parseCedula(value) {
  const m = CEDULA_RE.exec(String(value ?? "").trim());
  if (!m) return null;
  return { day: Number(m[2]), month: Number(m[3]), yy: Number(m[4]) };
}

// La fecha ddmmaa existe (en 19aa o 20aa: el siglo no viene en la cédula).
export function validCedulaDate({ day, month, yy }) {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysIn(month, 1900 + yy) || day <= daysIn(month, 2000 + yy);
}

const ymd = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// Mensaje de error, o null si la cédula es válida. Si se da la fecha de
// nacimiento, debe ser la misma de la cédula.
export function cedulaError(value, birthDate) {
  const parts = parseCedula(value);
  if (!parts) return FORMAT_MESSAGE;
  if (!validCedulaDate(parts)) {
    return "Los dígitos 4 al 9 de la cédula deben ser una fecha de nacimiento válida (ddmmaa).";
  }
  const birth = ymd(birthDate);
  if (birth) {
    const [y, mo, d] = birth.split("-").map(Number);
    if (d !== parts.day || mo !== parts.month || y % 100 !== parts.yy) {
      const pad = (n) => String(n).padStart(2, "0");
      return `La fecha de la cédula (${pad(parts.day)}/${pad(parts.month)}/${pad(parts.yy)}) no coincide con la fecha de nacimiento (${pad(d)}/${pad(mo)}/${y}).`;
    }
  }
  return null;
}
