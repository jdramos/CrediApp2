import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { credimasterPost } from "../api/credimasterClient";
import { persistLocalFile } from "../offline/filePersist";

// Registro de errores y cierres inesperados (2026-11-11). JELDER reportó que la app se cerró al subir una foto y no
// había forma de saber por qué. Dos casos:
//  1) Error de JavaScript no atrapado: se guarda antes de que la app se cierre y se manda al volver a abrir con sesión.
//  2) Android mata la app mientras la cámara/galería está al frente (poca memoria): no hay error de JS. Antes de abrir
//     el selector se deja una marca; si al arrancar la marca sigue ahí, la app fue cerrada en ese momento: se reporta
//     y se intenta recuperar la foto que sí alcanzó a tomarse (ImagePicker.getPendingResultAsync).
// Todo es "mejor esfuerzo": registrar un error nunca debe causar otro.

const QUEUE_KEY = "CM_CRASH_QUEUE_V1";
const MARK_KEY = "CM_PICKER_MARK_V1";
const PHOTO_KEY = "CM_RECOVERED_PHOTO_V1";
const MAX_QUEUE = 20;

let screen = null;
let pickerContext = null;
export const setCurrentScreen = (name) => {
  screen = name || null;
};
// Para qué se abre el selector ("idscan-front", ...); sin contexto se usa la pantalla actual.
export const setPickerContext = (ctx) => {
  pickerContext = ctx || null;
};

const deviceLabel = () => {
  try {
    const c = Platform.constants || {};
    return [Platform.OS, Platform.Version, c.Brand, c.Model].filter(Boolean).join(" ").slice(0, 160);
  } catch {
    return Platform.OS;
  }
};
const appVersion = () => Constants?.expoConfig?.version || Constants?.manifest?.version || null;

const readJson = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export async function recordError(kind, message, stack, extra = {}) {
  try {
    const queue = await readJson(QUEUE_KEY, []);
    queue.push({
      kind,
      message: String(message || "").slice(0, 500),
      stack: stack ? String(stack).slice(0, 6000) : null,
      context: extra.context || null,
      screen: extra.screen ?? screen,
      app_version: appVersion(),
      device: deviceLabel(),
      occurred_at: new Date().toISOString(),
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // sin espacio o sin almacenamiento: no hay nada más que hacer
  }
}

let installed = false;
export function installCrashLogging() {
  if (installed) return;
  installed = true;
  try {
    const eu = globalThis.ErrorUtils;
    if (!eu?.setGlobalHandler) return;
    const previous = eu.getGlobalHandler?.();
    eu.setGlobalHandler((error, isFatal) => {
      const done = () => previous && previous(error, isFatal);
      // Un error fatal cierra la app: se espera un instante a que se guarde, sin atorar el cierre.
      const timer = setTimeout(done, 600);
      recordError(isFatal ? "JS_FATAL" : "JS_ERROR", error?.message || String(error), error?.stack)
        .finally(() => {
          clearTimeout(timer);
          done();
        });
    });
  } catch {
    // no instalar el registro no puede impedir abrir la app
  }
}

// ---- marca del selector de fotos -------------------------------------------------------
export async function markPickerOpen(kind) {
  try {
    await AsyncStorage.setItem(MARK_KEY, JSON.stringify({ kind, context: pickerContext || screen, screen, at: Date.now() }));
  } catch {
    // nada
  }
}
export async function clearPickerMark() {
  try {
    await AsyncStorage.removeItem(MARK_KEY);
  } catch {
    // nada
  }
}

// Al arrancar: si quedó la marca, Android cerró la app con el selector abierto. Se reporta y se rescata la foto.
export async function checkPreviousSession() {
  try {
    const mark = await readJson(MARK_KEY, null);
    if (!mark) return null;
    await clearPickerMark();
    await recordError(
      "KILLED_DURING_PICKER",
      `La app se cerró con la ${mark.kind === "library" ? "galería" : "cámara"} abierta`,
      null,
      { context: mark.context, screen: mark.screen },
    );
    if (Platform.OS !== "android") return null;
    const pending = await ImagePicker.getPendingResultAsync?.();
    const asset = pending && !pending.canceled && !pending.code ? pending.assets?.[0] : null;
    if (!asset?.uri) return null;
    // La foto queda en la caché del selector; se copia a un lugar estable para usarla después.
    const name = asset.fileName || asset.uri.split("/").pop() || `foto_${Date.now()}.jpg`;
    const uri = await persistLocalFile(asset.uri, name);
    const photo = { uri, name, type: asset.mimeType || "image/jpeg", context: mark.context, at: Date.now() };
    await AsyncStorage.setItem(PHOTO_KEY, JSON.stringify(photo));
    return photo;
  } catch {
    return null;
  }
}

// La foto rescatada para ese contexto (una sola vez); null si no hay o es muy vieja (> 12 h).
export async function takeRecoveredPhoto(context) {
  try {
    const photo = await readJson(PHOTO_KEY, null);
    if (!photo || photo.context !== context) return null;
    await AsyncStorage.removeItem(PHOTO_KEY);
    if (Date.now() - Number(photo.at || 0) > 12 * 3600 * 1000) return null;
    return { uri: photo.uri, name: photo.name, type: photo.type };
  } catch {
    return null;
  }
}

// Manda lo guardado al servidor (con la sesión abierta) y lo borra si salió bien.
let flushing = false;
export async function flushCrashReports(token) {
  if (!token || flushing) return;
  flushing = true;
  try {
    const queue = await readJson(QUEUE_KEY, []);
    if (!queue.length) return;
    await credimasterPost("/api/client-errors", { errors: queue }, token);
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // sin señal: se manda la próxima vez
  } finally {
    flushing = false;
  }
}
