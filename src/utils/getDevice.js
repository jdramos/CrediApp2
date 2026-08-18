import * as Application from "expo-application";

export async function getDeviceId() {
  // Android: sync
  const a = Application.getAndroidId?.();
  if (a) return a;

  // iOS: async
  const i = await Application.getIosIdForVendorAsync?.();
  if (i) return i;

  // fallback (pero mejor que unknown)
  return `sim-${Date.now()}`;
}