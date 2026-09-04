import { Alert } from "react-native";

// Diálogo de confirmación estándar para cualquier acción que grabe o
// cambie algo en el backend (pagos, solicitudes, garantías, ubicación,
// contraseña, entregas...) — para que nunca se dispare un guardado por
// un toque accidental.
export function confirmAction(title, message, onConfirm, { confirmText = "Confirmar", destructive = false } = {}) {
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: confirmText, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
