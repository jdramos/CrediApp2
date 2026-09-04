import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "APP_SESSION_TOKEN_V1";
const REST_KEY = "APP_SESSION_REST_V1";
const LEGACY_KEY = "APP_SESSION_V1"; // esquema viejo: todo en un solo JSON sin cifrar

// El JWT es la credencial real -- va cifrado en el keystore/keychain del
// dispositivo vía SecureStore. El resto de la sesión (permisos, datos del
// usuario, tenant) es solo para pintar la UI, no un secreto en sí mismo, y
// puede superar el límite de tamaño por valor de SecureStore en Android
// (~2KB) si el tenant tiene muchos permission_tag -- por eso va aparte en
// AsyncStorage sin cifrar.
export async function saveSession(session) {
  const { token, ...rest } = session;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await AsyncStorage.setItem(REST_KEY, JSON.stringify(rest));
}

export async function loadSession() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
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
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await AsyncStorage.removeItem(REST_KEY);
  await AsyncStorage.removeItem(LEGACY_KEY);
}