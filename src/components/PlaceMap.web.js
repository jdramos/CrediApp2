import React from "react";
import { View } from "react-native";

// Versión web: react-native-maps no existe en el navegador, así que se incrusta el
// mapa de Google Maps (sin llave) centrado en el lugar elegido, o en el primero.
// Misma interfaz que PlaceMap.js.
export default function PlaceMap({ places, focusKey, style }) {
  const p = places.find((x) => x.key === focusKey) || places[0];
  const src = `https://maps.google.com/maps?q=${p.lat},${p.lng}&z=17&output=embed`;
  return (
    <View style={style}>
      {React.createElement("iframe", {
        key: src,
        src,
        title: `Mapa: ${p.label}`,
        style: { border: 0, width: "100%", height: "100%" },
        loading: "lazy",
        referrerPolicy: "no-referrer-when-downgrade",
      })}
    </View>
  );
}
