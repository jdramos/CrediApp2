import { Platform } from "react-native";

// En Android, react-native-maps usa Google Maps y necesita una llave compilada en la app
// (android.config.googleMaps.apiKey en app.json). Sin ella, mostrar un mapa CIERRA la app.
// La llave ya está en app.json, así que el mapa nativo va ACTIVO por omisión (también en los APK
// compilados en local, que no leen eas.json). Para apagarlo, EXPO_PUBLIC_ANDROID_MAPS=0 al compilar:
// entonces en Android se ofrece abrir el punto en Google Maps.
export const NATIVE_MAPS_AVAILABLE = Platform.OS !== "android" || process.env.EXPO_PUBLIC_ANDROID_MAPS !== "0";
