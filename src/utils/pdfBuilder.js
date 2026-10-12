// Armado de un PDF de varias páginas a partir de fotos JPEG, sin librerías
// nativas ni dependencias nuevas (funciona en Expo Go): un JPEG se puede
// incrustar tal cual en un PDF (filtro DCTDecode), así que solo hay que
// escribir la estructura del PDF alrededor de los bytes de cada foto.
// Todo lo de este archivo es JS puro, sin APIs de React Native, para poder
// probarlo con Node (ver la lectura/escritura de archivos en pdfFromPhotos.js).

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = (() => {
  const m = new Uint8Array(128).fill(255);
  for (let i = 0; i < B64.length; i += 1) m[B64.charCodeAt(i)] = i;
  return m;
})();

export function base64ToBytes(b64) {
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)] : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

export function bytesToBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[c & 63] : "=";
  }
  return out;
}

export const isJpeg = (bytes) => bytes && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;

// Lee del JPEG: ancho, alto, componentes (1 gris, 3 color) y la orientación
// EXIF (1..8; 1 = normal). Los visores de PDF NO aplican la orientación EXIF
// de una imagen incrustada, así que se compensa con /Rotate de la página.
export function readJpegInfo(bytes) {
  if (!isJpeg(bytes)) throw new Error("La imagen no es JPEG");
  let width = 0;
  let height = 0;
  let components = 3;
  let orientation = 1;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0..SOF15 (excepto DHT 0xC4, JPG 0xC8, DAC 0xCC) llevan las dimensiones
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = (bytes[i + 5] << 8) | bytes[i + 6];
      width = (bytes[i + 7] << 8) | bytes[i + 8];
      components = bytes[i + 9];
      break;
    }
    if (marker === 0xe1 && bytes[i + 4] === 0x45 && bytes[i + 5] === 0x78 && bytes[i + 6] === 0x69 && bytes[i + 7] === 0x66) {
      orientation = readExifOrientation(bytes, i + 10, len - 8) || 1;
    }
    if (marker === 0xda) break; // inicio de los datos de imagen
    i += 2 + len;
  }
  if (!width || !height) throw new Error("No se pudo leer el tamaño de la imagen");
  return { width, height, components, orientation };
}

function readExifOrientation(bytes, start, length) {
  const little = bytes[start] === 0x49; // "II" little-endian, "MM" big-endian
  const u16 = (o) => (little ? bytes[start + o] | (bytes[start + o + 1] << 8) : (bytes[start + o] << 8) | bytes[start + o + 1]);
  const u32 = (o) =>
    little
      ? (bytes[start + o] | (bytes[start + o + 1] << 8) | (bytes[start + o + 2] << 16) | (bytes[start + o + 3] << 24)) >>> 0
      : ((bytes[start + o] << 24) | (bytes[start + o + 1] << 16) | (bytes[start + o + 2] << 8) | bytes[start + o + 3]) >>> 0;
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > length) return null;
  const entries = u16(ifd);
  for (let n = 0; n < entries; n += 1) {
    const e = ifd + 2 + n * 12;
    if (e + 12 > length) return null;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return null;
}

// Giro (grados, sentido horario) que corrige cada orientación EXIF. Las
// orientaciones "espejo" (2, 4, 5, 7) son rarísimas en fotos de cámara y se
// tratan como su giro equivalente sin voltearlas.
const ORIENTATION_TO_ROTATE = { 1: 0, 2: 0, 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 };

const PAGE_W = 595; // A4 en puntos
const PAGE_H = 842;
const MARGIN = 24;

const enc = (s) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

// Arma el PDF. `pages`: [{ bytes: Uint8Array JPEG }]. Cada foto va en una
// página A4 centrada y a escala (sin deformarla); si la foto es horizontal la
// página sale horizontal para aprovecharla.
export function buildPdfFromJpegs(pages) {
  if (!pages.length) throw new Error("No hay páginas");
  const chunks = [];
  const offsets = []; // offsets[n] = posición del objeto n (1-based -> índice n)
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? enc(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObject = (n) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  const infos = pages.map((p) => {
    const info = readJpegInfo(p.bytes);
    if (info.components !== 1 && info.components !== 3) {
      throw new Error("Formato de color de la imagen no soportado");
    }
    return info;
  });

  // Numeración: 1 = catálogo, 2 = lista de páginas, y por página 3 objetos:
  // página, contenido, imagen.
  const pageObj = (idx) => 3 + idx * 3;
  const contentObj = (idx) => 4 + idx * 3;
  const imageObj = (idx) => 5 + idx * 3;
  const total = 2 + pages.length * 3;

  push("%PDF-1.4\n%âãÏÓ\n");

  beginObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObject(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>\nendobj\n`);

  pages.forEach((page, idx) => {
    const info = infos[idx];
    const rotate = ORIENTATION_TO_ROTATE[info.orientation] || 0;
    // Tamaño de la imagen YA girada (lo que verá el lector)
    const shownW = rotate === 90 || rotate === 270 ? info.height : info.width;
    const shownH = rotate === 90 || rotate === 270 ? info.width : info.height;
    const landscape = shownW > shownH;
    const pw = landscape ? PAGE_H : PAGE_W;
    const ph = landscape ? PAGE_W : PAGE_H;
    const scale = Math.min((pw - 2 * MARGIN) / shownW, (ph - 2 * MARGIN) / shownH);
    const drawW = shownW * scale;
    const drawH = shownH * scale;
    const x = (pw - drawW) / 2;
    const y = (ph - drawH) / 2;

    // La imagen se dibuja SIN girar (cm con su tamaño original escalado) y el
    // giro lo hace /Rotate en la página: para /Rotate 90/270 hay que dibujar
    // la imagen con las dimensiones sin girar dentro del área ya girada.
    let cm;
    if (rotate === 0) {
      cm = `${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`;
    } else if (rotate === 180) {
      // /Rotate 180 gira la página: se dibuja normal en la página ya girada
      cm = `${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`;
    } else {
      // 90/270: el rectángulo visible es drawW x drawH, pero la imagen cruda
      // tiene sus lados intercambiados; se escala con los lados sin girar.
      // Posición centrada en el espacio SIN girar (de tamaño ph x pw).
      const rx = (ph - drawH) / 2;
      const ry = (pw - drawW) / 2;
      cm = `${drawH.toFixed(2)} 0 0 ${drawW.toFixed(2)} ${rx.toFixed(2)} ${ry.toFixed(2)} cm`;
    }

    // En /Rotate 90 o 270 el /MediaBox es el de la página SIN girar: se
    // intercambia para que el resultado visible sea pw x ph.
    const boxW = rotate === 90 || rotate === 270 ? ph : pw;
    const boxH = rotate === 90 || rotate === 270 ? pw : ph;

    beginObject(pageObj(idx));
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${boxW} ${boxH}] ${rotate ? `/Rotate ${rotate} ` : ""}` +
        `/Resources << /XObject << /Im0 ${imageObj(idx)} 0 R >> >> /Contents ${contentObj(idx)} 0 R >>\nendobj\n`,
    );

    const content = `q\n${cm}\n/Im0 Do\nQ\n`;
    beginObject(contentObj(idx));
    push(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

    beginObject(imageObj(idx));
    push(
      `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} ` +
        `/ColorSpace /${info.components === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 ` +
        `/Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
    );
    push(page.bytes);
    push("\nendstream\nendobj\n");
  });

  const xrefStart = length;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n += 1) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
