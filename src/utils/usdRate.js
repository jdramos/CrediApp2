import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUsdRate } from "../api/paymentApi";
import { isNetworkError } from "../api/credimasterClient";
import { todayISO } from "./date";

const KEY = "usd.buyRate.v1";

// Tipo de cambio de COMPRA de dólares de la institución para HOY (el que fija el
// supervisor en Caja → Tipo de cambio). Se guarda el de hoy para poder cobrar en
// dólares sin señal; si no hay conexión y no hay uno guardado de hoy, no se puede.
// Devuelve { enabled, available, buy_rate, message, fromCache }.
export async function loadUsdRate(token) {
  try {
    const res = await getUsdRate(token);
    const out = {
      enabled: !!res?.enabled,
      available: !!res?.available,
      buy_rate: res?.buy_rate ? Number(res.buy_rate) : null,
      date: res?.date || todayISO(),
      message: res?.message || null,
      fromCache: false,
    };
    try {
      if (out.available) await AsyncStorage.setItem(KEY, JSON.stringify({ date: out.date, buy_rate: out.buy_rate }));
      else await AsyncStorage.removeItem(KEY);
    } catch {
      // sin almacenamiento: solo no habrá respaldo sin conexión
    }
    return out;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    try {
      const cached = JSON.parse((await AsyncStorage.getItem(KEY)) || "null");
      if (cached?.buy_rate && cached.date === todayISO()) {
        return { enabled: true, available: true, buy_rate: Number(cached.buy_rate), date: cached.date, message: null, fromCache: true };
      }
    } catch {
      // se trata como sin tipo de cambio
    }
    return { enabled: false, available: false, buy_rate: null, date: todayISO(), message: null, fromCache: false, offline: true };
  }
}
