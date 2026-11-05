import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

// Aviso del expediente del cliente vencido o por vencer (solo alerta).
// `status` viene de GET /api/customers/:id/info-update.

const RISK = { BAJO: "bajo", MEDIO: "medio", ALTO: "alto", MUY_ALTO: "muy alto" };
const dmy = (v) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");

export const infoUpdateMessage = (s) => {
  if (!s || !["OVERDUE", "DUE_SOON"].includes(s.status)) return "";
  const plazo = `${s.risk_level ? `riesgo ${RISK[String(s.risk_level).toUpperCase()] || s.risk_level}` : "sin nivel de riesgo"}: cada ${s.months} meses`;
  const desde = s.never_updated ? "nunca se ha actualizado" : `última actualización ${dmy(s.last_update)}`;
  return s.status === "OVERDUE"
    ? `Expediente vencido desde el ${dmy(s.due_date)} (${plazo}; ${desde}).`
    : `El expediente vence el ${dmy(s.due_date)}, en ${s.days_left} día(s) (${plazo}; ${desde}).`;
};

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start", borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.sm },
  text: { flex: 1, color: COLORS.text },
});

export default function InfoUpdateBanner({ status, style }) {
  const message = infoUpdateMessage(status);
  if (!message) return null;
  const overdue = status.status === "OVERDUE";
  return (
    <View
      style={[
        styles.box,
        { backgroundColor: overdue ? COLORS.dangerSoft : COLORS.warningSoft, borderColor: overdue ? COLORS.danger : COLORS.warning },
        style,
      ]}
    >
      <MaterialCommunityIcons name="file-alert-outline" size={20} color={overdue ? COLORS.danger : COLORS.warning} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}
