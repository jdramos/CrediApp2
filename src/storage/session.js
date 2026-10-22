import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "APP_SESSION_TOKEN_V1";
const REST_KEY = "APP_SESSION_REST_V1";
const LEGACY_KEY = "APP_SESSION_V1"; // esquema viejo: todo en un solo JSON sin cifrar

// expo-secure-store no tiene implementación en web (no hay keystore/keychain
// del navegador) -- ahí se usa AsyncStorage también para el token, igual que
// el resto de la sesión. En iOS/Android el comportamiento no cambia.
const TokenStore = Platform.OS === "web"
  ? { setItemAsync: AsyncStorage.setItem, getItemAsync: AsyncStorage.getItem, deleteItemAsync: AsyncStorage.removeItem }
  : SecureStore;

// El JWT es la credencial real -- va cifrado en el keystore/keychain del
// dispositivo vía SecureStore. El resto de la sesión (permisos, datos del
// usuario, tenant) es solo para pintar la UI, no un secreto en sí mismo, y
// puede superar el límite de tamaño por valor de SecureStore en Android
// (~2KB) si el tenant tiene muchos permission_tag -- por eso va aparte en
// AsyncStorage sin cifrar.
export async function saveSession(session) {
  const { token, ...rest } = session;
  await TokenStore.setItemAsync(TOKEN_KEY, token);
  await AsyncStorage.setItem(REST_KEY, JSON.stringify(rest));
}

export async function loadSession() {
  const token = await TokenStore.getItemAsync(TOKEN_KEY);
  if (token) {
    const raw = await AsyncStorage.getItem(REST_KEY);
    return { token, ...(raw ? JSON.parse(raw) : {}) };
  }

  // Migración única desde el esquema viejo, para no cerrarle la sesión a
  // quien ya la tenía abierta antes de este cambio.
  const legacyRaw = await AsyncStorage.getItem(LEGACY_KEY);
  if (!legacyRaw) return null;
  const legacy = JSON.parse(legacyRaw);
  if (!legacy?.token) return null;
  await saveSession(legacy);
  await AsyncStorage.removeItem(LEGACY_KEY);
  return legacy;
}

export async function clearSession() {
  await TokenStore.deleteItemAsync(TOKEN_KEY);
  await AsyncStorage.removeItem(REST_KEY);
  await AsyncStorage.removeItem(LEGACY_KEY);
}

// "Recordar este dispositivo" (2FA): tras verificar el código una vez, el
// servidor entrega un token que, enviado en el login, evita pedir el código de
// nuevo durante unos días. Es una credencial, así que va en el mismo almacén
// del token de sesión y NO se borra al cerrar sesión (si no, no serviría).
// Se guarda uno por usuario de este dispositivo.
const TRUSTED_KEY = "APP_TRUSTED_DEVICES_V1";
const userKey = (username) => String(username || "").trim().toLowerCase();

async function readTrusted() {
  try {
    const raw = await TokenStore.getItemAsync(TRUSTED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function getTrustedDeviceToken(username) {
  return (await readTrusted())[userKey(username)] || null;
}

export async function saveTrustedDeviceToken(username, token) {
  const map = await readTrusted();
  if (token) map[userKey(username)] = token;
  else delete map[userKey(username)];
  try {
    await TokenStore.setItemAsync(TRUSTED_KEY, JSON.stringify(map));
  } catch {
    // sin almacenamiento: simplemente se pedirá el código la próxima vez
  }
}
