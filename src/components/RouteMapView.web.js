import React, { forwardRef, useImperativeHandle } from "react";
import { View, Linking, StyleSheet } from "react-native";
import { Text, Button } from "react-native-paper";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  box: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  text: { color: COLORS.muted, textAlign: "center" },
});

const openInGoogleMaps = (lat, lng) =>
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);

// Versión web: react-native-maps no existe en web, así que se muestra un aviso y
// se abre Google Maps en el punto (la ruta completa está en "Rutas del día" de
// la plataforma web). Misma interfaz que RouteMapView.js.
const RouteMapView = forwardRef(function RouteMapView({ style, path }, ref) {
  useImperativeHandle(ref, () => ({
    fit: () => {},
    focus: (lat, lng) => openInGoogleMaps(lat, lng),
  }));

  return (
    <View style={[style, styles.box]}>
      <Text style={styles.text}>El mapa solo está en la app del teléfono. Acá tenés la línea de tiempo; el recorrido dibujado está en «Rutas del día» de CrediMaster web.</Text>
      <Button mode="outlined" icon="map-marker" onPress={() => openInGoogleMaps(path[0].latitude, path[0].longitude)}>
        Ver inicio en Google Maps
      </Button>
    </View>
  );
});

export default RouteMapView;
