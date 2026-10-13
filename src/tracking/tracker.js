import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { AppState } from "react-native";
import { credimasterPost, isNetworkError } from "../api/credimasterClient";

// Rastreo de la ruta del día ("jornada"). El cobrador inicia y termina la
// jornada a mano (con aviso de consentimiento, ver WorkdayCard.js); mientras
// está activa, la app registra su posición cada ~30 s o 25 m y la envía por
// lotes a POST /api/tracking/points. Los puntos que no se pueden enviar (sin
// señal) quedan en un buffer local y se reintentan, así que una ruta hecha sin
// conexión igual llega completa después.
//
// LIMITACIÓN IMPORTANTE: hoy el registro es EN PRIMER PLANO -- funciona con la
// app abierta (aunque se cambie de pantalla dentro de ella). Con la app en
// segundo plano o el teléfono bloqueado el sistema pausa la ubicación y la
// ruta tendrá huecos. El rastreo en segundo plano exige expo-task-manager y un
// development build (no corre en Expo Go), igual que la impresora Bluetooth.

const STATE_KEY = "TRACKING_STATE_V1";
const BUFFER_KEY = "TRACKING_BUFFER_V1";

const SAMPLE_MS = 30 * 1000;
const SAMPLE_METERS = 25;
const FLUSH_EVERY_MS = 2 * 60 * 1000;
const FLUSH_BATCH = 200;
const BUFFER_CAP = 5000; // ~1.5 días de puntos; si se llena se descartan los más viejos
const MAX_ACCURACY_KEEP_M = 200;
const AUTO_STOP_MS = 14 * 3600 * 1000; // una jornada olvidada abierta se cierra sola

let watcher = null;
let flushTimer = null;
let appStateSub = null;
let sessionGetter = () => null; // () => ({ token, userId }) de la sesión actual
let flushing = false;
let status = {
  active: false,
  startedAt: null,
  lastPointAt: null,
  lastFlushAt: null,
  distanceM: 0,
  pointsTotal: 0,
  buffered: 0,
  error: "",
};
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn({ ...status }));

export function subscribeTracking(fn) {
  listeners.add(fn);
  fn({ ...status });
  return () => listeners.delete(fn);
}

export const setTrackingSessionGetter = (fn) => {
  sessionGetter = fn;
};

const readJson = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento: se sigue en memoria
  }
};

const haversineM = (a, b) => {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

// El buffer se lee, modifica y reescribe desde dos lugares que pueden
// coincidir (llega un punto mientras un envío está en curso): sin ordenar los
// accesos, una escritura pisaría a la otra y se perderían puntos. Cada acceso
// pasa por esta cola, de a uno.
let bufferLock = Promise.resolve();
const withBufferLock = (fn) => {
  const run = bufferLock.then(fn, fn);
  bufferLock = run.catch(() => {});
  return run;
};

function appendPoint(point) {
  return withBufferLock(async () => {
    const buffer = await readJson(BUFFER_KEY, []);
    const last = buffer[buffer.length - 1];
    buffer.push(point);
    const trimmed = buffer.length > BUFFER_CAP ? buffer.slice(buffer.length - BUFFER_CAP) : buffer;
    await writeJson(BUFFER_KEY, trimmed);
    status = {
      ...status,
      lastPointAt: point.t,
      pointsTotal: status.pointsTotal + 1,
      buffered: trimmed.length,
      distanceM:
        last && (point.accuracy == null || point.accuracy <= 100)
          ? status.distanceM + haversineM(last, point)
          : status.distanceM,
    };
    emit();
    if (trimmed.length >= FLUSH_BATCH / 4) flushTracking().catch(() => {});
  });
}

// Envía el buffer por lotes. Un error de RED deja todo en el buffer para el
// próximo intento; un error del servidor (400: ningún punto válido) descarta
// ese lote para no reintentarlo eternamente.
export async function flushTracking() {
  if (flushing) return;
  const sess = sessionGetter();
  const token = sess?.token;
  if (!token) return;
  flushing = true;
  try {
    // El aviso de inicio/fin de jornada pudo quedar pendiente por falta de señal:
    // se reintenta aquí, porque ya hay un envío en marcha.
    sendSessionMarkers().catch(() => {});
    const state = await readJson(STATE_KEY, null);
    // Los puntos son de quien inició la jornada: si hoy hay otro usuario en el
    // teléfono (la sesión anterior se cerró sin pasar por signOut), no se
    // envían con su token -- se descartan.
    if (state?.userId != null && sess.userId != null && state.userId !== sess.userId) {
      await AsyncStorage.multiRemove([STATE_KEY, BUFFER_KEY]).catch(() => {});
      status = { ...status, active: false, buffered: 0 };
      stopWatching();
      emit();
      return;
    }
    for (;;) {
      const chunk = (await withBufferLock(() => readJson(BUFFER_KEY, []))).slice(0, FLUSH_BATCH);
      if (!chunk.length) break;
      try {
        await credimasterPost(
          "/api/tracking/points",
          {
            session_key: state?.sessionKey,
            points: chunk.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, speed: p.speed, t: p.t })),
          },
          token,
        );
      } catch (e) {
        if (isNetworkError(e)) break;
        if (e?.status !== 400) break; // otro error del servidor: reintentar más tarde
        // 400: lote inválido -> se descarta
      }
      // Se quita del buffer lo ya enviado POR INSTANTE (no por posición): mientras
      // el envío estaba en curso pudieron llegar puntos nuevos al final.
      const sent = new Set(chunk.map((p) => p.t));
      const remaining = await withBufferLock(async () => {
        const current = (await readJson(BUFFER_KEY, [])).filter((p) => !sent.has(p.t));
        await writeJson(BUFFER_KEY, current);
        return current.length;
      });
      status = { ...status, buffered: remaining, lastFlushAt: Date.now() };
    }
    emit();
  } finally {
    flushing = false;
  }
}

async function beginWatching() {
  if (watcher) return;
  watcher = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: SAMPLE_MS, distanceInterval: SAMPLE_METERS },
    (loc) => {
      const c = loc?.coords;
      if (!c) return;
      if (c.accuracy != null && c.accuracy > MAX_ACCURACY_KEEP_M) return;
      appendPoint({
        lat: c.latitude,
        lng: c.longitude,
        accuracy: c.accuracy ?? null,
        speed: c.speed != null && c.speed >= 0 ? c.speed : null,
        t: loc.timestamp || Date.now(),
      }).catch(() => {});
    },
  );
  flushTimer = setInterval(() => {
    flushTracking().catch(() => {});
    checkAutoStop().catch(() => {});
  }, FLUSH_EVERY_MS);
  appStateSub = AppState.addEventListener("change", (s) => {
    if (s === "active") {
      flushTracking().catch(() => {});
      checkAutoStop().catch(() => {});
    }
  });
}

function stopWatching() {
  try {
    watcher?.remove();
  } catch {
    // ya estaba detenido
  }
  watcher = null;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  appStateSub?.remove?.();
  appStateSub = null;
}

async function checkAutoStop() {
  const state = await readJson(STATE_KEY, null);
  if (state?.active && Date.now() - state.startedAt > AUTO_STOP_MS) await stopTracking();
}

// Pide el permiso de ubicación y arranca la jornada. Devuelve { ok, reason }.
export async function startTracking() {
  const existing = await readJson(STATE_KEY, null);
  if (existing?.active) {
    await beginWatching().catch(() => {});
    return { ok: true };
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: "no-permission" };

  const sessionKey = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  await writeJson(STATE_KEY, { active: true, sessionKey, startedAt, startSent: false, userId: sessionGetter()?.userId ?? null });
  status = { ...status, active: true, startedAt, distanceM: 0, pointsTotal: 0, error: "" };
  emit();
  try {
    await beginWatching();
  } catch (e) {
    await writeJson(STATE_KEY, null);
    status = { ...status, active: false, error: e?.message || "No se pudo iniciar el rastreo" };
    emit();
    return { ok: false, reason: "watch-failed" };
  }
  sendSessionMarkers().catch(() => {});
  return { ok: true };
}

// Avisa al servidor el inicio / fin de la jornada; si no hay señal queda
// pendiente y se reintenta en el siguiente flush de la app.
async function sendSessionMarkers() {
  const token = sessionGetter()?.token;
  const state = await readJson(STATE_KEY, null);
  if (!token || !state?.sessionKey) return;
  try {
    if (!state.startSent) {
      await credimasterPost(
        "/api/tracking/sessions/start",
        { session_key: state.sessionKey, started_at: state.startedAt },
        token,
      );
      state.startSent = true;
      await writeJson(STATE_KEY, state);
    }
    if (!state.active && state.endedAt && !state.endSent) {
      await credimasterPost(
        "/api/tracking/sessions/end",
        { session_key: state.sessionKey, ended_at: state.endedAt },
        token,
      );
      state.endSent = true;
      await writeJson(STATE_KEY, state);
    }
  } catch {
    // se reintenta después
  }
}

export async function stopTracking() {
  const state = await readJson(STATE_KEY, null);
  stopWatching();
  if (state) {
    await writeJson(STATE_KEY, { ...state, active: false, endedAt: Date.now(), endSent: false });
  }
  status = { ...status, active: false };
  emit();
  await flushTracking().catch(() => {});
  await sendSessionMarkers().catch(() => {});
}

// ¿Hay una jornada activa de ESTE usuario? Lee el estado guardado (no el
// estado en memoria): sobrevive a que la app se cierre y reabra. Una jornada
// de otro usuario o vencida (más de AUTO_STOP_MS) no cuenta.
export async function isWorkdayActive() {
  const state = await readJson(STATE_KEY, null);
  if (!state?.active) return false;
  const userId = sessionGetter()?.userId;
  if (state.userId != null && userId != null && state.userId !== userId) return false;
  return Date.now() - state.startedAt <= AUTO_STOP_MS;
}

// Al abrir la app: si la jornada seguía activa (la app se cerró), se retoma el
// registro; si el estado quedó pendiente de avisar al servidor, se reintenta.
export async function resumeTrackingIfActive() {
  const state = await readJson(STATE_KEY, null);
  if (!state) return;
  const userId = sessionGetter()?.userId;
  if (state.userId != null && userId != null && state.userId !== userId) {
    await AsyncStorage.multiRemove([STATE_KEY, BUFFER_KEY]).catch(() => {});
    return;
  }
  const buffer = await readJson(BUFFER_KEY, []);
  status = { ...status, active: !!state.active, startedAt: state.startedAt || null, buffered: buffer.length };
  emit();
  if (state.active) {
    if (Date.now() - state.startedAt > AUTO_STOP_MS) {
      await stopTracking();
      return;
    }
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.granted) await beginWatching().catch(() => {});
  }
  flushTracking().catch(() => {});
  sendSessionMarkers().catch(() => {});
}

// Al cerrar sesión: los puntos pertenecen a quien los generó -- se intenta
// enviar lo pendiente y se borra todo del teléfono.
export async function resetTracking() {
  stopWatching();
  await flushTracking().catch(() => {});
  await sendSessionMarkers().catch(() => {});
  try {
    await AsyncStorage.multiRemove([STATE_KEY, BUFFER_KEY]);
  } catch {
    // best-effort
  }
  status = {
    active: false,
    startedAt: null,
    lastPointAt: null,
    lastFlushAt: null,
    distanceM: 0,
    pointsTotal: 0,
    buffered: 0,
    error: "",
  };
  emit();
}
