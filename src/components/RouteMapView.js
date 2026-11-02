import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { NATIVE_MAPS_AVAILABLE } from "../utils/mapsConfig";
import { openPlaceInMaps } from "../utils/maps";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

// Mapa de la ruta del día (iOS/Android). En web existe RouteMapView.web.js con
// la misma interfaz: react-native-maps es solo nativo y no se puede importar ahí.
// Sin llave de Google Maps en Android (utils/mapsConfig.js) no se monta el mapa nativo:
// tocar un evento de la línea de tiempo abre ese punto en Google Maps.
const RouteMapView = forwardRef(function RouteMapView(props, ref) {
  return NATIVE_MAPS_AVAILABLE ? <NativeRouteMap ref={ref} {...props} /> : <RouteWithoutMap ref={ref} {...props} />;
});

export default RouteMapView;

const fallbackStyles = StyleSheet.create({
  box: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
  },
});

const RouteWithoutMap = forwardRef(function RouteWithoutMap(_props, ref) {
  useImperativeHandle(ref, () => ({
    fit: () => {},
    focus: (lat, lng) => openPlaceInMaps(lat, lng),
  }));
  return (
    <View style={fallbackStyles.box}>
      <Text style={{ color: COLORS.muted }}>
        El mapa no se muestra dentro de la app. Tocá un punto de la línea de tiempo para verlo en Google Maps.
      </Text>
    </View>
  );
});

const NativeRouteMap = forwardRef(function NativeRouteMap({ style, path, markers, onReady }, ref) {
  // Se carga solo cuando se va a usar: así no se toca react-native-maps donde no hay llave.
  const { default: MapView, Polyline, Marker } = require("react-native-maps");
  const mapRef = useRef(null);

  const fit = () => {
    const coords = [...path, ...markers.map((m) => ({ latitude: m.lat, longitude: m.lng }))];
    if (coords.length && mapRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 50, right: 40, bottom: 50, left: 40 },
        animated: true,
      });
    }
  };

  useImperativeHandle(ref, () => ({
    fit,
    focus: (lat, lng) =>
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 400),
  }));

  return (
    <MapView
      ref={mapRef}
      style={style}
      initialRegion={{ latitude: path[0].latitude, longitude: path[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      onMapReady={fit}
      onLayout={fit}
      toolbarEnabled={false}
    >
      <Polyline coordinates={path} strokeColor="#1D4ED8" strokeWidth={4} />
      {markers.map((m) => (
        <Marker
          key={m.key}
          coordinate={{ latitude: m.lat, longitude: m.lng }}
          pinColor={m.color}
          title={m.title}
          description={m.description}
        />
      ))}
    </MapView>
  );
});
