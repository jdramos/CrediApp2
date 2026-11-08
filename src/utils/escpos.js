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

// lines: array de strings (ya a 32 columnas). Devuelve Uint8Array con el trabajo completo:
// iniciar, tabla de caracteres, las líneas, avance de papel (y corte si `cut`).
export function buildEscPos(lines, { accents = false, feed = 4, cut = false } = {}) {
  const bytes = [ESC, 0x40]; // ESC @: reiniciar la impresora
  if (accents) bytes.push(ESC, 0x74, 19); // ESC t 19: PC858
  else bytes.push(ESC, 0x74, 0); // ESC t 0: PC437 (solo se imprime ASCII)
  for (const line of lines || []) {
    bytes.push(...encodeLine(line, accents), 0x0a);
  }
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
