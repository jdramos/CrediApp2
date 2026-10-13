import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { getMyReminders } from "../api/collectionsApi";
import { isWorkdayActive } from "../tracking/tracker";
import { todayISO } from "../utils/date";
import { money } from "../utils/format";

// Recordatorios de cobro LOCALES: la app programa en el propio dispositivo
// (no hay servidor de push de por medio) una notificación por la mañana con
// lo que vence/promete HOY y otra por la tarde con lo de MAÑANA. Se calculan
// con GET /api/collections/my-reminders y se re-programan cada vez que la app
// abre, así que reflejan los pagos recién hechos; entre aperturas funcionan
// aunque no haya señal. También sirven en Expo Go (a diferencia del push
// remoto en Android).

const ENABLED_KEY = "reminders.enabled";
const LAST_SYNC_KEY = "reminders.lastSyncAt";
const CHANNEL_ID = "reminders";
const MIN_RESYNC_MS = 30 * 60 * 1000;

const WORKDAY_MORNING = { hour: 7, minute: 15 };
const MORNING = { hour: 7, minute: 30 };
const EVENING = { hour: 18, minute: 0 };

// Por defecto activados: es un recordatorio de trabajo, y el usuario los
// puede apagar desde "Más".
export async function remindersEnabled() {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) !== "0";
  } catch {
    return true;
  }
}

export async function setRemindersEnabled(enabled) {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
    if (!enabled) await AsyncStorage.removeItem(LAST_SYNC_KEY);
  } catch {
    // sin almacenamiento: el cambio vale solo por esta apertura
  }
  if (!enabled) await cancelReminders();
}

// Se llama al cerrar sesión: las notificaciones programadas traen datos de la
// cartera de quien las programó y no deben sobrevivir a su sesión.
export async function cancelReminders() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // best-effort
  }
}

async function ensurePermission(request) {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && request) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    return status === "granted";
  } catch {
    return false;
  }
}

const atTime = (isoDay, { hour, minute }) => {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function buildBody(day) {
  const parts = [];
  if (day.due_loans > 0) parts.push(`${plural(day.due_loans, "cuota", "cuotas")} por ${money(day.due_amount)}`);
  if (day.promises > 0) {
    parts.push(`${plural(day.promises, "promesa de pago", "promesas de pago")} por ${money(day.promises_amount)}`);
  }
  return parts.join(" y ");
}

const workdayReminderId = (isoDay) => `workday-${isoDay}`;

// Cancela el aviso "Iniciá tu jornada" de HOY (se llama al iniciar la jornada,
// para que no suene después de haberla iniciado). Nunca lanza.
export async function cancelWorkdayReminderForToday() {
  try {
    await Notifications.cancelScheduledNotificationAsync(workdayReminderId(todayISO()));
  } catch {
    // no estaba programado
  }
}

// Re-programa los recordatorios de los próximos días. `force` salta el
// límite de una vez cada 30 minutos (al encender el interruptor en "Más").
// `requestPermission` pide el permiso del sistema si todavía no se otorgó.
// `workday`: el usuario debe iniciar su jornada (ver tracking/workday.js), así que
// además se programa un aviso a las 7:15, de lunes a sábado, para iniciarla.
// Devuelve { ok, scheduled, reason } -- nunca lanza.
export async function syncReminders(token, { force = false, requestPermission = false, workday = false } = {}) {
  try {
    if (!token) return { ok: false, scheduled: 0, reason: "no-session" };
    if (!(await remindersEnabled())) return { ok: true, scheduled: 0, reason: "disabled" };

    if (!force) {
      const last = Number(await AsyncStorage.getItem(LAST_SYNC_KEY)) || 0;
      if (Date.now() - last < MIN_RESYNC_MS) return { ok: true, scheduled: 0, reason: "recent" };
    }

    if (!(await ensurePermission(requestPermission))) return { ok: false, scheduled: 0, reason: "no-permission" };

    const res = await getMyReminders(token);
    if (!res?.linked) return { ok: true, scheduled: 0, reason: "not-linked" };
    const days = res.days || [];

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Recordatorios de cobro",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Se parte de cero: lo programado antes quedó viejo respecto a los datos
    // que acaban de llegar.
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();
    let scheduled = 0;
    const schedule = async (date, title, body, { identifier, type = "REMINDER_DAY" } = {}) => {
      if (date <= now) return;
      await Notifications.scheduleNotificationAsync({
        ...(identifier ? { identifier } : {}),
        content: { title, body, data: { type } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
      });
      scheduled += 1;
    };

    // Si la jornada de hoy ya está iniciada, no se avisa para hoy.
    const workdayActive = workday ? await isWorkdayActive() : false;

    for (let i = 0; i < days.length; i += 1) {
      const day = days[i];

      if (workday) {
        const [y, m, d] = day.date.split("-").map(Number);
        const isSunday = new Date(y, m - 1, d).getDay() === 0;
        const isToday = i === 0;
        if (!isSunday && !(isToday && workdayActive)) {
          await schedule(
            atTime(day.date, WORKDAY_MORNING),
            "Iniciá tu jornada",
            "Para registrar pagos y gestiones tenés que iniciar tu jornada. Se registra tu ruta del día y funciona sin señal.",
            { identifier: workdayReminderId(day.date), type: "WORKDAY_REMINDER" },
          );
        }
      }

      const today = buildBody(day);
      if (today) await schedule(atTime(day.date, MORNING), "Cobros de hoy", today);

      const tomorrow = days[i + 1] ? buildBody(days[i + 1]) : "";
      if (tomorrow) {
        await schedule(atTime(day.date, EVENING), "Mañana en tu cartera", `${tomorrow}. Revisá también tu cierre del día.`);
      }
    }

    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    return { ok: true, scheduled };
  } catch (e) {
    return { ok: false, scheduled: 0, reason: e?.message || "error" };
  }
}

// Programa un aviso de prueba que llega en ~10 segundos, para comprobar que
// el teléfono muestra las notificaciones sin esperar a las 7:30. Pide el
// permiso si hace falta. Devuelve { ok, reason }.
export async function sendTestReminder() {
  try {
    if (!(await ensurePermission(true))) return { ok: false, reason: "no-permission" };
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Recordatorios de cobro",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Cobros de hoy (prueba)",
        body: "Así se verán tus recordatorios: cuotas que vencen y promesas de pago del día.",
        data: { type: "REMINDER_DAY" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
        channelId: CHANNEL_ID,
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "error" };
  }
}
