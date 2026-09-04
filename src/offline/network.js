import NetInfo from "@react-native-community/netinfo";

// `isConnected` solo dice que hay una interfaz de red activa (wifi/datos);
// `isInternetReachable` es la validación real de que llega a internet.
// Puede venir `null` mientras el chequeo está en curso -- en ese caso se
// asume conectado (no bloquear la UI por un estado transitorio).
function resolveOnline(state) {
  return !!state.isConnected && state.isInternetReachable !== false;
}

export function subscribeToConnectivity(cb) {
  return NetInfo.addEventListener((state) => cb(resolveOnline(state)));
}

export async function isConnected() {
  const state = await NetInfo.fetch();
  return resolveOnline(state);
}
