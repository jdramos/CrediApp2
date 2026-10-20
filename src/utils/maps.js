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

// Orden de visita para recorrer `points` ([{ lat, lng }]) partiendo de `origin`:
// primero el vecino más cercano y luego se afina con 2-opt (invertir tramos
// mientras acorten el camino). Devuelve los índices de `points` en el orden a
// seguir. Camino abierto: no hay que volver al punto de partida.
export function planRoute(origin, points) {
  const n = points.length;
  if (n === 0) return [];
  const left = points.map((_, i) => i);
  const order = [];
  let cur = origin;
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((idx, k) => {
      const d = distanceMeters(cur, points[idx]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    const [idx] = left.splice(best, 1);
    order.push(idx);
    cur = points[idx];
  }

  if (n > 2 && n <= 80) {
    const at = (k) => (k < 0 ? origin : points[order[k]]);
    let improved = true;
    let guard = 0;
    while (improved && guard < 50) {
      improved = false;
      guard += 1;
      for (let i = 0; i < n - 1; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const before = distanceMeters(at(i - 1), at(i)) + (j + 1 < n ? distanceMeters(at(j), at(j + 1)) : 0);
          const after = distanceMeters(at(i - 1), at(j)) + (j + 1 < n ? distanceMeters(at(i), at(j + 1)) : 0);
          if (after + 1e-6 < before) {
            const seg = order.slice(i, j + 1).reverse();
            order.splice(i, seg.length, ...seg);
            improved = true;
          }
        }
      }
    }
  }
  return order;
}

// Largo total (m, en línea recta) de visitar `points` en `order` desde `origin`.
export function routeLength(origin, points, order) {
  let total = 0;
  let cur = origin;
  order.forEach((i) => {
    total += distanceMeters(cur, points[i]);
    cur = points[i];
  });
  return total;
}

// Google Maps admite hasta 9 paradas intermedias + el destino por enlace.
export const MAPS_MAX_STOPS = 10;

// Abre Google Maps con el recorrido: sale de `origin` (tu ubicación), pasa por
// las paradas en orden y termina en la última. Se quitan paradas repetidas
// seguidas (dos créditos del mismo cliente) y se usan las primeras 10.
export async function openRouteInMaps(origin, stops) {
  const list = [];
  stops.forEach((s) => {
    const prev = list[list.length - 1];
    if (!prev || prev.lat !== s.lat || prev.lng !== s.lng) list.push(s);
  });
  const used = list.slice(0, MAPS_MAX_STOPS);
  if (!used.length) return 0;
  const dest = used[used.length - 1];
  const c = (v) => Number(v).toFixed(6);
  const way = used.slice(0, -1).map((s) => `${c(s.lat)},${c(s.lng)}`).join("|");
  const url =
    `https://www.google.com/maps/dir/?api=1&origin=${c(origin.lat)},${c(origin.lng)}` +
    `&destination=${c(dest.lat)},${c(dest.lng)}` +
    (way ? `&waypoints=${encodeURIComponent(way)}` : "") +
    "&travelmode=driving";
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("No se pudo abrir el mapa", "Revisá que tengas una app de mapas o un navegador instalado.");
    return 0;
  }
  return used.length;
}

