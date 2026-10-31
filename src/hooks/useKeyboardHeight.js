import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// Altura del teclado en pantalla (0 si está oculto). En Android moderno la app
// se dibuja de borde a borde y la ventana ya no se achica sola cuando aparece el
// teclado, así que un formulario necesita este espacio extra para poder verse y
// desplazarse por encima del teclado. En la web no hay teclado en pantalla.
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) =>
      setHeight(e?.endCoordinates?.height || 0),
    );
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
