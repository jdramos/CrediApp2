import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { startTracking, isWorkdayActive, resumeTrackingIfActive } from "./tracker";

// Política "jornada obligatoria": un usuario vinculado a un cobrador debe tener
// su jornada iniciada (registro de la ruta del día, ver tracker.js) para
// registrar pagos y gestiones/visitas desde la app. El GPS y el registro
// funcionan SIN señal: los puntos se guardan en el teléfono y se envían al
// servidor cuando vuelve la conexión, así que la regla nunca exige internet.
//
// Se aplica en la app (no en el servidor): los pagos hechos sin señal llegan
// horas después y el servidor no puede saber si había jornada en ese momento.
// Para apagarla en una compilación: EXPO_PUBLIC_REQUIRE_WORKDAY=0.
const REQUIRE_WORKDAY = process.env.EXPO_PUBLIC_REQUIRE_WORKDAY !== "0";

const CONSENT_KEY = "TRACKING_CONSENT_V1";

export const CONSENT_TEXT =
  "Mientras la jornada esté activa, la app registra tu ubicación cada medio minuto aproximadamente y la envía a la empresa.\n\n" +
  "• Tus supervisores con permiso pueden ver tu ruta del día.\n" +
  "• Solo se registra mientras la jornada está iniciada: la empezás y la terminás vos.\n" +
  "• Funciona sin señal: los puntos se guardan en el teléfono y se envían cuando vuelva la conexión.\n" +
  "• Los puntos se guardan 90 días.\n" +
  "• La app debe estar abierta para registrar (con la pantalla encendida).";

// ¿Este usuario debe tener la jornada iniciada para operar? Solo los que
// tienen cobrador vinculado (los de oficina no hacen ruta). `collector_id`
// llega en el login; una sesión guardada de antes del cambio no lo trae y no
// queda sujeta a la regla hasta que vuelva a iniciar sesión.
export function workdayRequired(session) {
  return REQUIRE_WORKDAY && !!session?.user?.collector_id;
}

const NO_PERMISSION_MESSAGE =
  "Necesito el permiso de ubicación para registrar tu ruta. Activalo en los ajustes del teléfono y volvé a intentar.";

// Pide el consentimiento (una sola vez) y arranca la jornada. Devuelve
// { ok, reason } y nunca lanza.
export async function startWorkdayWithConsent() {
  let accepted = false;
  try {
    accepted = (await AsyncStorage.getItem(CONSENT_KEY)) === "1";
  } catch {
    // sin almacenamiento: se vuelve a preguntar
  }
  if (!accepted) {
    const agreed = await new Promise((resolve) => {
      Alert.alert(
        "Registrar tu ruta del día",
        CONSENT_TEXT,
        [
          { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
          { text: "Entiendo, iniciar", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!agreed) return { ok: false, reason: "declined" };
    try {
      await AsyncStorage.setItem(CONSENT_KEY, "1");
    } catch {
      // se volverá a preguntar la próxima vez
    }
  }
  try {
    const res = await startTracking();
    return res.ok ? { ok: true } : { ok: false, reason: res.reason };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export const startFailureMessage = (reason) =>
  reason === "no-permission" ? NO_PERMISSION_MESSAGE : "No se pudo iniciar el registro de la ruta.";

// Puerta de entrada para las acciones que exigen jornada. Devuelve true si se
// puede continuar: la regla no aplica, la jornada ya estaba activa, o el
// usuario la inició en este momento desde el aviso. `what` va en el mensaje
// ("pagos", "gestiones y visitas").
export async function ensureWorkday(session, what) {
  if (!workdayRequired(session)) return true;

  if (await isWorkdayActive()) {
    // La jornada sigue marcada como activa pero el registro pudo haberse
    // detenido (la app se cerró y reabrió): se retoma.
    await resumeTrackingIfActive().catch(() => {});
    return true;
  }

  return new Promise((resolve) => {
    Alert.alert(
      "Primero iniciá tu jornada",
      `Para registrar ${what} tenés que tener tu jornada iniciada. Se registra tu ruta del día y funciona aunque no tengas señal: se envía cuando vuelva la conexión.`,
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Iniciar jornada",
          onPress: async () => {
            const res = await startWorkdayWithConsent();
            if (res.ok) {
              resolve(true);
              return;
            }
            if (res.reason !== "declined") Alert.alert("No se pudo iniciar la jornada", startFailureMessage(res.reason));
            resolve(false);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
