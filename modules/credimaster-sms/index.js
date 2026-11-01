import { Platform } from "react-native";

// Envío de SMS en segundo plano: solo existe en el APK de Android. En iOS, la web y
// Expo Go el módulo no está y todo queda en null (la app cae al aviso manual).
let native = null;
if (Platform.OS === "android") {
  try {
    const { requireNativeModule } = require("expo");
    native = requireNativeModule("CredimasterSms");
  } catch {
    native = null;
  }
}

export const isSilentSmsAvailable = () => !!native;
export const hasSendSmsPermission = () => (native ? !!native.hasPermission() : false);
export const isSimReady = () => (native ? !!native.isSimReady() : false);
export const sendSmsSilently = (phone, body) => {
  if (!native) return Promise.reject(Object.assign(new Error("Este teléfono no puede enviar SMS desde la app"), { code: "ERR_UNAVAILABLE" }));
  return native.send(phone, body);
};
