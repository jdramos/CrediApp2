import { Platform } from "react-native";

// En Android, react-native-maps usa Google Maps y necesita una llave compilada en la app
// (android.config.googleMaps.apiKey en app.json). Sin ella, mostrar un mapa CIERRA la app. Mientras
// no haya llave, en Android no se monta el mapa nativo: se ofrece abrir el punto en Google Maps.
// Cuando se agregue la llave, se activa poniendo EXPO_PUBLIC_ANDROID_MAPS=1 en eas.json.
export const NATIVE_MAPS_AVAILABLE = Platform.OS !== "android" || process.env.EXPO_PUBLIC_ANDROID_MAPS === "1";
