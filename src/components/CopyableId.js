import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../theme/colors";

// Cédula del cliente con un botón para copiarla de un toque (la pegan en
// otras apps y sistemas). Copia el valor tal como está guardado, sin espacios
// alrededor. El toque no llega a la fila donde esté (no abre el detalle).
// `label` va delante en el mismo texto (p. ej. "Cédula: "); `textStyle` es el
// estilo de la línea donde se muestra.
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  icon: { marginLeft: 4 },
});

export default function CopyableId({ value, label = "", fallback = "-", textStyle, style, numberOfLines }) {
  const text = String(value ?? "").trim();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!text) {
    return (
      <Text style={textStyle} numberOfLines={numberOfLines}>
        {label}
        {fallback}
      </Text>
    );
  }

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <View style={[styles.row, style]}>
      <Text style={[textStyle, { flexShrink: 1 }]} numberOfLines={numberOfLines} selectable>
        {label}
        {text}
      </Text>
      <Pressable
        onPress={copy}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={copied ? "Cédula copiada" : `Copiar cédula ${text}`}
        style={styles.icon}
      >
        <MaterialCommunityIcons
          name={copied ? "check" : "content-copy"}
          size={14}
          color={copied ? COLORS.success : COLORS.muted}
        />
      </Pressable>
      {copied && <Text style={[textStyle, { color: COLORS.success, marginLeft: 4 }]}>Copiada</Text>}
    </View>
  );
}
