import React from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

// ScrollView para formularios: cuando aparece el teclado se desplaza solo hasta
// que el campo enfocado quede visible (en Android moderno la app se dibuja de
// borde a borde y el teclado, si no, tapa los campos de abajo). Requiere el
// KeyboardProvider de App.js. Se usa en lugar de ScrollView en toda pantalla o
// ventana con campos de texto.
export default function KeyboardAwareScroll({ bottomOffset = 24, keyboardShouldPersistTaps = "handled", ...props }) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    />
  );
}
