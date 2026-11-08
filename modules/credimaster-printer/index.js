import { Platform } from "react-native";

// Impresión por Bluetooth clásico (SPP) en impresoras térmicas ESC/POS: solo existe en
// el APK de Android. En iOS, la web y Expo Go el módulo no está y todo queda en null (la
// app avisa que la impresión no está disponible).
let native = null;
if (Platform.OS === "android") {
  try {
    const { requireNativeModule } = require("expo");
    native = requireNativeModule("CredimasterPrinter");
  } catch {
    native = null;
  }
}

const unavailable = () =>
  Promise.reject(Object.assign(new Error("Este teléfono no puede imprimir por Bluetooth desde la app"), { code: "ERR_UNAVAILABLE" }));

export const isBluetoothPrintAvailable = () => !!native && !!native.isSupported();
export const hasBluetoothPermission = () => (native ? !!native.hasPermission() : false);
export const isBluetoothOn = () => (native ? !!native.isBluetoothOn() : false);
// [{ name, address, isPrinter }] de los dispositivos ya emparejados en el teléfono.
export const getPairedDevices = () => (native ? native.getPairedDevices() || [] : []);
// Envía los bytes (base64) a la impresora con esa dirección MAC; resuelve al terminar.
export const sendBytes = (address, base64) => (native ? native.print(address, base64) : unavailable());
