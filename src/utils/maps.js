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
