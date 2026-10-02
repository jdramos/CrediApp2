import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  text: { color: COLORS.warning, fontWeight: "600", flex: 1, fontSize: 12 },
});

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "7:42 a. m." si es de hoy; "01/10 7:42 a. m." si es de otro día.
function formatCachedAt(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("es-NI", { hour: "numeric", minute: "2-digit" });
  if (sameDay(d, new Date())) return time;
  const day = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${day} ${time}`;
}

// Aviso de que lo que se ve es la última copia guardada (sin conexión). No se
// muestra si los datos vinieron frescos del servidor (`cachedAt` null).
export default function OfflineNotice({ cachedAt }) {
  if (!cachedAt) return null;
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="cloud-off-outline" size={18} color={COLORS.warning} />
      <Text style={styles.text}>
        Sin conexión — estás viendo los datos guardados de las {formatCachedAt(cachedAt)}. Deslizá hacia abajo para
        actualizar cuando vuelva la señal.
      </Text>
    </View>
  );
}
