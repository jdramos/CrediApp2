import { useWindowDimensions } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";

// Estilo para el contenedor de un Modal de react-native-paper que tiene campos de texto.
// La app se dibuja de borde a borde y el teclado no reduce la ventana: un modal centrado
// quedaba con su parte de abajo (y el botón Guardar) tapada. Con el teclado abierto el modal
// se sube (margen inferior = alto del teclado) y su alto máximo se limita a lo que queda
// visible. Sin teclado no cambia nada (devuelve el estilo base tal cual).
//
// Uso: <Modal contentContainerStyle={useKeyboardModalStyle(styles.modal)}>
// (el hook va arriba del componente, no dentro del JSX).
export default function useKeyboardModalStyle(base, margin = 16) {
  const keyboardHeight = useKeyboardState((s) => (s.isVisible ? s.height : 0));
  const { height } = useWindowDimensions();
  if (!keyboardHeight) return base;
  return [base, { marginBottom: margin + keyboardHeight, maxHeight: Math.max(240, height - keyboardHeight - margin * 2 - 32) }];
}
