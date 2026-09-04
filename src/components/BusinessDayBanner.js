import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.warningSoft,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    padding: SPACING.md,
  },
  text: { color: COLORS.warning, fontWeight: "600" },
});

// Aviso no bloqueante: informa si la sucursal del crédito/solicitud aún no
// abrió el día operativo de hoy (o tiene uno anterior sin cerrar) ANTES de
// que el cobrador intente pagar/crear un crédito y reciba el HTTP 423 del
// backend a mitad de flujo (ver middleware/businessDay.js del backend y
// hooks/useBusinessDayStatus.js).
export default function BusinessDayBanner({ status }) {
  if (!status) return null;

  // pending_action "CLOSE" + is_backlog=false === el día de hoy está
  // abierto y al día -> operación permitida, no hay nada que avisar.
  const isOperational = status.pending_action === "CLOSE" && !status.is_backlog;
  if (isOperational) return null;

  const message =
    status.pending_action === "OPEN"
      ? `Tu sucursal todavía no abrió el día operativo de hoy (${status.today}). No vas a poder registrar pagos ni créditos hasta que se abra.`
      : `Hay un día anterior (${status.pending_date}) sin cerrar en tu sucursal. No vas a poder registrar pagos ni créditos hasta que se cierre.`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}
