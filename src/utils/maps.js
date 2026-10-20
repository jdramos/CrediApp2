import { Alert, Linking } from "react-native";

const toCoord = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Destino del cliente: la casa primero (donde se le suele cobrar) y, si no
// hay, el negocio. Devuelve { lat, lng, label } o null si no tiene ninguna
// ubicación guardada. Las coordenadas llegan como strings (DECIMAL de MySQL).
export function customerDestination(c) {
  const homeLat = toCoord(c?.home_lat);
  const homeLng = toCoord(c?.home_lng);
  if (homeLat != null && homeLng != null) return { lat: homeLat, lng: homeLng, label: "casa" };
  const bizLat = toCoord(c?.business_lat);
  const bizLng = toCoord(c?.business_lng);
  if (bizLat != null && bizLng != null) return { lat: bizLat, lng: bizLng, label: "negocio" };
  return null;
}

// Abre la app de mapas con la ruta hacia el cliente. El enlace universal de
// Google Maps (api=1) abre la app de Maps si está instalada y, si no, el
// navegador -- sirve igual en Android e iOS, sin dependencias nativas.
export async function openDirections(customer) {
  const dest = customerDestination(customer);
  if (!dest) {
    Alert.alert(
      "Sin ubicación",
      "Este cliente no tiene la ubicación de su casa o negocio guardada. Podés registrarla desde la ficha del cliente (Ubicación).",
    );
    return;
  }
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("No se pudo abrir el mapa", "Revisá que tengas una app de mapas o un navegador instalado.");
  }
}

// Distancia en metros en línea recta entre dos puntos { lat, lng } (Haversine).
export function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 350 -> "350 m" · 1240 -> "1.2 km" · 15800 -> "16 km".
export function formatDistance(m) {
  if (m == null) return "";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
