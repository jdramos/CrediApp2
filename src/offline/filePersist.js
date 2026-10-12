// En SDK 54+ la API clásica (getInfoAsync, copyAsync, etc.) salió del import
// principal y ahí LANZA un error en tiempo de ejecución; vive en /legacy.
import * as FileSystem from "expo-file-system/legacy";

// Las fotos que devuelve expo-image-picker viven en un caché que el
// sistema operativo puede purgar en cualquier momento -- si se van a
// encolar para sincronizar más tarde (puede pasar horas hasta que
// vuelva la señal), hay que copiarlas a un directorio propio y estable
// de la app antes de perder la referencia original.
const DIR = `${FileSystem.documentDirectory}offline_queue/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
}

export async function persistLocalFile(uri, suggestedName) {
  await ensureDir();
  const name = `${Date.now()}-${suggestedName || uri.split("/").pop() || "archivo"}`;
  const dest = DIR + name;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function deletePersistedFile(uri) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // si ya no existe, no hay nada que limpiar
  }
}
