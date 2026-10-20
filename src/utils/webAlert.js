import { Alert, Platform } from "react-native";

// react-native-web trae Alert.alert vacío: en el navegador no muestra nada y
// nunca llama a los botones, así que toda confirmación ("¿Enviar la solicitud?",
// cerrar sesión, iniciar jornada...) parecía no hacer nada. Aquí se implementa
// con los diálogos nativos del navegador. En iOS/Android no se toca.
if (Platform.OS === "web" && typeof window !== "undefined") {
  Alert.alert = (title, message, buttons, options) => {
    const text = [title, message].filter(Boolean).join("\n\n");
    const list = Array.isArray(buttons) && buttons.length ? buttons : [{ text: "OK" }];
    const cancel = list.find((b) => b.style === "cancel");
    const actions = list.filter((b) => b !== cancel);

    // Solo informativo (o un único botón): aviso simple y se ejecuta su acción.
    if (!cancel && actions.length <= 1) {
      window.alert(text);
      actions[0]?.onPress?.();
      return;
    }

    // Confirmar / Cancelar: se ofrece cada acción en orden; si rechaza todas,
    // cuenta como cancelar.
    for (const action of actions) {
      const question = actions.length > 1 ? `${text}\n\n¿${action.text}?` : text;
      if (window.confirm(question)) {
        action.onPress?.();
        return;
      }
    }
    if (cancel?.onPress) cancel.onPress();
    else options?.onDismiss?.();
  };
}
