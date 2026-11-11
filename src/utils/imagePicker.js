import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { markPickerOpen, clearPickerMark } from "./crashLog";

const buildFile = (asset) => {
  const uri = asset.uri;
  const name = asset.fileName || uri.split("/").pop() || `foto_${Date.now()}.jpg`;
  const ext = name.split(".").pop()?.toLowerCase();
  const type = asset.mimeType || (ext === "png" ? "image/png" : "image/jpeg");
  return { uri, name, type };
};

// Cada foto que toma el selector queda en la caché de la app (ImagePicker/) y no se
// borra sola: con las fotos de entregas, cédulas y comprobantes se llena el teléfono
// y la cámara termina fallando con "Failed to write a file". Antes de abrir la cámara
// o la galería se borran las de más de un día (las ya enviadas o encoladas; lo
// pendiente de enviar se copia aparte, ver offline/filePersist.js).
const PICKER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export async function purgeOldPickerCache(maxAgeMs = PICKER_CACHE_MAX_AGE_MS) {
  if (Platform.OS === "web" || !FileSystem.cacheDirectory) return;
  try {
    const dir = `${FileSystem.cacheDirectory}ImagePicker/`;
    const names = await FileSystem.readDirectoryAsync(dir).catch(() => []);
    const now = Date.now();
    await Promise.all(
      names.map(async (name) => {
        const info = await FileSystem.getInfoAsync(dir + name);
        if (info.exists && info.modificationTime && now - info.modificationTime * 1000 > maxAgeMs) {
          await FileSystem.deleteAsync(dir + name, { idempotent: true });
        }
      }),
    );
  } catch {
    // limpiar la caché nunca debe impedir tomar la foto
  }
}

// El selector falla con mensajes técnicos cuando el teléfono no tiene espacio.
const friendlyPickerError = (e) => {
  const msg = String(e?.message || e || "");
  if (/failed to write|no space|enospc|disk full|not enough space/i.test(msg)) {
    return new Error("El teléfono casi no tiene espacio para guardar la foto. Liberá espacio (borrá fotos, videos o apps que no uses) e intentá de nuevo.");
  }
  return e instanceof Error ? e : new Error(msg || "No se pudo abrir la cámara.");
};

async function launchCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Se necesita permiso de cámara para tomar la foto.");
  purgeOldPickerCache();
  let res;
  // Marca: si Android cierra la app con la cámara abierta, al arrancar se reporta y se rescata la foto.
  await markPickerOpen("camera");
  try {
    res = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ["images"] });
  } catch (e) {
    await clearPickerMark();
    throw friendlyPickerError(e);
  }
  await clearPickerMark();
  if (res.canceled || !res.assets?.[0]) return null;
  return buildFile(res.assets[0]);
}

async function launchLibrary() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Se necesita permiso para acceder a tus fotos.");
  purgeOldPickerCache();
  let res;
  await markPickerOpen("library");
  try {
    res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
  } catch (e) {
    await clearPickerMark();
    throw friendlyPickerError(e);
  }
  await clearPickerMark();
  if (res.canceled || !res.assets?.[0]) return null;
  return buildFile(res.assets[0]);
}

// Abre directo la cámara (sin galería) para comprobantes que deben ser una
// foto del momento, como el recibido de la entrega de un desembolso. Devuelve
// { uri, name, type } o null si el usuario cancela.
export function takePhoto() {
  return launchCamera();
}

// Muestra "Cámara / Galería / Cancelar" y devuelve { uri, name, type } listo
// para meter en un FormData, o null si el usuario cancela.
export function pickImage() {
  return new Promise((resolve, reject) => {
    Alert.alert(
      "Agregar foto",
      "¿Cómo querés agregarla?",
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
        { text: "Galería", onPress: () => launchLibrary().then(resolve).catch(reject) },
        { text: "Cámara", onPress: () => launchCamera().then(resolve).catch(reject) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

// Arma el FormData listo para credimasterUpload. El nombre del campo del
// archivo varía por endpoint: "file" en garantías/documentos de cliente,
// "image" en la entrega de desembolsos — por eso es configurable.
export function buildImagesFormData(files, extraFields = {}, fieldName = "images") {
  const form = new FormData();
  if (Platform.OS === "web") {
    form.__webFiles = { fieldName, files };
  } else {
    files.forEach((file) => form.append(fieldName, { uri: file.uri, name: file.name, type: file.type }));
  }
  Object.entries(extraFields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  return form;
}

export function buildImageFormData(file, extraFields = {}, fieldName = "file") {
  const form = new FormData();
  if (Platform.OS === "web") {
    // En el navegador FormData no acepta el objeto { uri, name, type } (lo
    // vuelve texto y el servidor responde "falta la imagen"); necesita un Blob
    // real. Como armarlo es asíncrono, se deja anotado y credimasterUpload lo
    // completa justo antes de enviar.
    form.__webFile = { fieldName, file };
  } else {
    form.append(fieldName, { uri: file.uri, name: file.name, type: file.type });
  }
  Object.entries(extraFields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  return form;
}
