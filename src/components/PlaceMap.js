import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Text, Button } from "react-native-paper";
import { NATIVE_MAPS_AVAILABLE } from "../utils/mapsConfig";
import { openPlaceInMaps } from "../utils/maps";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

// Mapa con la casa y/o el negocio del cliente (iOS/Android). `places`:
// [{ key, label, lat, lng, color }]. `focusKey` centra el mapa en uno; sin él, se
// ajusta para ver todos. En web existe PlaceMap.web.js con la misma interfaz.
// Sin llave de Google Maps en Android (utils/mapsConfig.js) no se monta el mapa nativo.
export default function PlaceMap(props) {
  return NATIVE_MAPS_AVAILABLE ? <NativePlaceMap {...props} /> : <PlacesWithoutMap {...props} />;
}

const fallbackStyles = StyleSheet.create({
  box: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
});

// El punto ya quedó capturado; para verlo en el mapa se abre Google Maps.
function PlacesWithoutMap({ places }) {
  return (
    <View style={fallbackStyles.box}>
      <Text style={{ color: COLORS.muted }}>El mapa no se muestra dentro de la app. Abrí el punto en Google Maps:</Text>
      {places.map((p) => (
        <Button key={p.key} mode="outlined" icon="map-marker" onPress={() => openPlaceInMaps(p.lat, p.lng)} style={{ borderRadius: RADIUS.md }}>
          {`Ver ${String(p.label || "").toLowerCase()} en Google Maps`}
        </Button>
      ))}
    </View>
  );
}

function NativePlaceMap({ places, focusKey, style }) {
  // Se carga solo cuando se va a usar: así no se toca react-native-maps donde no hay llave.
  const { default: MapView, Marker } = require("react-native-maps");
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
