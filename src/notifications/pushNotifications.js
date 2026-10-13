import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Pide permiso y obtiene el Expo push token del dispositivo. Devuelve
// null (sin lanzar) si no aplica: simulador/emulador, permiso negado, o
// falta el projectId de EAS (`eas init` no se ha corrido en este
// proyecto) — en cualquiera de esos casos la app sigue funcionando
// normal, solo sin push.
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn(
      "[push] Falta el projectId de EAS en este proyecto (corre `eas init`) — notificaciones push deshabilitadas.",
    );
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    console.warn("[push] No se pudo obtener el token de push:", err.message);
    return null;
  }
}

// Navega a la bandeja de aprobaciones cuando el usuario toca una
// notificación de "solicitud pendiente". `navigationRef` es el ref del
// NavigationContainer (ver AppNavigator.js) — se resuelve así porque el
// listener vive fuera del árbol de React Navigation.
export function handleNotificationResponse(response, navigationRef) {
  const data = response?.notification?.request?.content?.data;
  if (!navigationRef?.isReady()) return;
  if (data?.type === "APPROVAL_ASSIGNED") {
    navigationRef.navigate("App", { screen: "Creditos", params: { screen: "ApprovalInbox" } });
  } else if (data?.type === "REMINDER_DAY") {
    navigationRef.navigate("Productivity");
  } else if (data?.type === "WORKDAY_REMINDER") {
    // El botón "Iniciar jornada" está en el Inicio (tarjeta Mi jornada).
    navigationRef.navigate("App", { screen: "Inicio" });
  }
}
