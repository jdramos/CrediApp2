import React, { useEffect, useRef } from "react";
import MapView, { Marker } from "react-native-maps";

// Mapa con la casa y/o el negocio del cliente (iOS/Android). `places`:
// [{ key, label, lat, lng, color }]. `focusKey` centra el mapa en uno; sin él, se
// ajusta para ver todos. En web existe PlaceMap.web.js con la misma interfaz.
export default function PlaceMap({ places, focusKey, style }) {
  const ref = useRef(null);

  const fit = () => {
    if (!ref.current || !places.length) return;
    if (places.length === 1) {
      ref.current.animateToRegion({ latitude: places[0].lat, longitude: places[0].lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 300);
    } else {
      ref.current.fitToCoordinates(
        places.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 60, right: 50, bottom: 60, left: 50 }, animated: true },
      );
    }
  };

  useEffect(() => {
    const p = places.find((x) => x.key === focusKey);
    if (p && ref.current) {
      ref.current.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.003, longitudeDelta: 0.003 }, 400);
    } else {
      fit();
    }
  }, [focusKey, places.map((p) => `${p.key}:${p.lat},${p.lng}`).join("|")]);

  const first = places[0];
  return (
    <MapView
      ref={ref}
      style={style}
      initialRegion={{ latitude: first.lat, longitude: first.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
      onMapReady={fit}
      toolbarEnabled={false}
    >
      {places.map((p) => (
        <Marker key={p.key} coordinate={{ latitude: p.lat, longitude: p.lng }} pinColor={p.color} title={p.label} />
      ))}
    </MapView>
  );
}
