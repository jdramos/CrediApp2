import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNetworkError } from "../api/credimasterClient";

// Caché de LECTURAS para las pantallas que el cobrador consulta en la calle
// (cartera, productividad, cierre del día): si no hay señal, se muestra la
// última respuesta que sí llegó, avisando de cuándo es. No toca las escrituras
// (pagos, visitas), que ya van por la cola offline (queue.js).
//
// Las claves llevan el id del usuario (lo arma quien llama) y todo se borra al
// cerrar sesión (clearCache, ver SessionContext.js): son datos de cartera de
// clientes y no deben sobrevivir al usuario que los vio.

const PREFIX = "READ_CACHE_V1:";

export async function readCache(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null; // { data, cachedAt }
  } catch {
    return null;
  }
}

async function writeCache(key, data) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {
    // sin espacio o sin almacenamiento: la pantalla igual funciona en línea
  }
}

// Pide `fetcher()`; si responde, guarda y devuelve { data, cachedAt: null }.
// Si falla por RED (no por un error real del servidor) y hay una copia
// guardada, devuelve { data, cachedAt } con la fecha de esa copia. Sin copia,
// relanza el error original.
export async function cachedFetch(key, fetcher) {
  try {
    const data = await fetcher();
    await writeCache(key, data);
    return { data, cachedAt: null };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = await readCache(key);
    if (!cached) throw e;
    return { data: cached.data, cachedAt: cached.cachedAt };
  }
}

export async function clearCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // best-effort
  }
}
