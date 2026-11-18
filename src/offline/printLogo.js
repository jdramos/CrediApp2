import { readCache } from "./cache";
import { base64ToBytes } from "../utils/pdfBuilder";

// Logo de la empresa para los recibos de la impresora Bluetooth. Lo baja prefetch.js al iniciar sesión con
// señal (ya convertido a blanco y negro por el servidor) y queda en la copia de lecturas (cache.js), así que
// imprime también sin señal y se borra al cerrar sesión. Devuelve { top, bottom } con
// { width, height, bytes: Uint8Array } o null si la empresa no tiene logo o aún no se bajó.
export const PRINT_LOGO_CACHE_KEY = "printLogo";

function decode(l) {
  if (!l || !l.width || !l.height || typeof l.data !== "string") return null;
  try {
    const bytes = base64ToBytes(l.data);
    // Un mapa de bits con otro tamaño del que dice sería basura en el papel: se descarta.
    if (l.width % 8 !== 0 || bytes.length !== (l.width / 8) * l.height) return null;
    return { width: l.width, height: l.height, bytes };
  } catch {
    return null;
  }
}

export async function getStoredPrintLogo() {
  const cached = await readCache(PRINT_LOGO_CACHE_KEY);
  const logo = cached?.data?.logo;
  const top = decode(logo?.top);
  if (!top) return null;
  return { top, bottom: decode(logo?.bottom) };
}
