import React, { forwardRef, useImperativeHandle, useRef } from "react";
import MapView, { Polyline, Marker } from "react-native-maps";

// Mapa de la ruta del día (iOS/Android). En web existe RouteMapView.web.js con
// la misma interfaz: react-native-maps es solo nativo y no se puede importar ahí.
const RouteMapView = forwardRef(function RouteMapView({ style, path, markers, onReady }, ref) {
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

export default RouteMapView;
