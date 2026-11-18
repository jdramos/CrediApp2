// Arma los bytes ESC/POS de un ticket de texto (impresoras térmicas Bluetooth de 58 mm,
// 32 caracteres por línea). Sin dependencias: se puede probar en Node.
//
// Acentos: las impresoras baratas no traen todas las tablas de caracteres. Por omisión
// se imprime SIN tildes (á→a, ñ→n), que sale bien en cualquier modelo. Con
// `accents: true` se usa la tabla PC858 (ESC t 19), que cubre el español, y es lo que
// hay que probar con la impresora real antes de dejarlo activado.

const ESC = 0x1b;
const GS = 0x1d;

// PC858 (Latin-1 + €): solo lo que usa el español.
const CP858 = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "ü": 0x81,
  "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9, "Ñ": 0xa5, "Ü": 0x9a,
  "¿": 0xa8, "¡": 0xad, "º": 0xa7, "ª": 0xa6, "°": 0xf8, "€": 0xd5,
};

// Texto seguro para cualquier impresora: quita las tildes y lo que no sea ASCII.
export function toAscii(text) {
  return String(text ?? "")
    .replace(/ñ/g, "n").replace(/Ñ/g, "N")
    .replace(/¿/g, "?").replace(/¡/g, "!")
    .replace(/[º°ª]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—·•]/g, "-")
    .replace(/[^\x20-\x7e]/g, "?");
}

function encodeLine(text, accents) {
  const out = [];
  for (const ch of String(text ?? "").replace(/[\r\n]/g, " ")) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) out.push(code);
    else if (accents && CP858[ch] !== undefined) out.push(CP858[ch]);
    else {
      const ascii = toAscii(ch);
      for (const a of ascii) out.push(a.charCodeAt(0));
    }
  }
  return out;
}

// Imagen en blanco y negro (GS v 0): `logo` = { width, height, bytes } con 8 puntos por byte, de izquierda a derecha,
// 1 = negro (lo arma el servidor, ver utils/printLogo.js del backend). Va centrada. Se manda en franjas de 96 filas
// porque algunas impresoras baratas no aceptan una imagen alta de una sola vez.
function rasterLogo(logo) {
  const out = [ESC, 0x61, 1]; // ESC a 1: centrar
  const rowBytes = logo.width / 8;
  for (let y = 0; y < logo.height; y += 96) {
    const rows = Math.min(96, logo.height - y);
    out.push(GS, 0x76, 0x30, 0x00, rowBytes & 0xff, rowBytes >> 8, rows & 0xff, rows >> 8);
    for (let i = y * rowBytes; i < (y + rows) * rowBytes; i++) out.push(logo.bytes[i]);
  }
  out.push(ESC, 0x61, 0); // ESC a 0: izquierda otra vez
  return out;
}

const validLogo = (l) =>
  !!l && l.width > 0 && l.width <= 384 && l.width % 8 === 0 && l.height > 0 && l.bytes && l.bytes.length === (l.width / 8) * l.height;

// lines: array de strings (ya a 32 columnas). Devuelve Uint8Array con el trabajo completo:
// iniciar, tabla de caracteres, las líneas, avance de papel (y corte si `cut`).
// `logoTop` / `logoBottom` (opcionales): logo de la empresa en el encabezado y, más pequeño, al pie.
export function buildEscPos(lines, { accents = false, feed = 4, cut = false, logoTop = null, logoBottom = null } = {}) {
  const bytes = [ESC, 0x40]; // ESC @: reiniciar la impresora
  if (accents) bytes.push(ESC, 0x74, 19); // ESC t 19: PC858
  else bytes.push(ESC, 0x74, 0); // ESC t 0: PC437 (solo se imprime ASCII)
  if (validLogo(logoTop)) bytes.push(...rasterLogo(logoTop), 0x0a);
  for (const line of lines || []) {
    bytes.push(...encodeLine(line, accents), 0x0a);
  }
  if (validLogo(logoBottom)) bytes.push(0x0a, ...rasterLogo(logoBottom), 0x0a);
  bytes.push(ESC, 0x64, Math.max(0, Math.min(feed, 10))); // ESC d n: avanzar n líneas
  if (cut) bytes.push(GS, 0x56, 0x42, 0x00); // GS V 66 0: corte parcial
  return Uint8Array.from(bytes);
}

// Ticket corto para probar la conexión y cómo salen las tildes.
export const TEST_LINES = [
  "      PRUEBA DE IMPRESION",
  "--------------------------------",
  "CrediApp - impresora Bluetooth",
  "Acentos: áéíóú ñ Ñ ¿? ¡!",
  "--------------------------------",
  "Si lee esto, la impresora",
  "esta lista para los recibos.",
];
