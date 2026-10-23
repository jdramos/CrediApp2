import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, IconButton, Chip, Button, ActivityIndicator } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { money } from "../../utils/format";
import { COLORS } from "../../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../../theme/layout";

export const fin = StyleSheet.create({
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  title: { fontWeight: "800", color: COLORS.text },
  muted: { color: COLORS.muted, fontSize: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  rowLabel: { color: COLORS.text, flex: 1 },
  rowValue: { color: COLORS.text, fontWeight: "700" },
  total: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 2, paddingTop: 6 },
  error: { color: COLORS.danger, textAlign: "center", marginTop: SPACING.lg, paddingHorizontal: SPACING.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
});

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const periodLabel = (period) => {
  const [y, m] = String(period || "").split("-").map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : "";
};
export const shiftPeriod = (period, delta) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Navegación por mes (‹ Septiembre 2026 ›); no deja pasar del mes actual.
export function MonthNav({ period, onChange, disabled }) {
  const isCurrent = !period || period >= currentPeriod();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
      <IconButton icon="chevron-left" disabled={disabled || !period} onPress={() => onChange(shiftPeriod(period, -1))} />
      <Text style={{ color: COLORS.text, fontWeight: "800", minWidth: 150, textAlign: "center" }}>{periodLabel(period) || "…"}</Text>
      <IconButton icon="chevron-right" disabled={disabled || isCurrent} onPress={() => onChange(shiftPeriod(period, 1))} />
    </View>
  );
}

// Variación contra el período anterior: ▲ sube / ▼ baja, con color según si
// subir es bueno. `kind`: "money" | "pct" (puntos porcentuales). `polarity`: "higher"
// (subir es bueno), "lower" (bajar es bueno) o "neutral".
export function Delta({ current, previous, kind = "money", polarity = "neutral" }) {
  if (previous == null || current == null) return null;
  const diff = Number(current) - Number(previous);
  if (Math.abs(diff) < (kind === "pct" ? 0.005 : 0.5)) return <Text style={fin.muted}>sin cambio</Text>;
  const up = diff > 0;
  const good = polarity === "neutral" ? null : (polarity === "higher") === up;
  const color = good == null ? COLORS.muted : good ? COLORS.success : COLORS.danger;
  const text = kind === "pct" ? `${Math.abs(diff).toFixed(2)} pts` : money(Math.abs(diff));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <MaterialCommunityIcons name={up ? "arrow-up" : "arrow-down"} size={12} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export function Row({ label, value, strong, sub, color }) {
  return (
    <View style={[fin.row, strong && fin.total]}>
      <View style={{ flex: 1 }}>
        <Text style={[fin.rowLabel, strong && { fontWeight: "800" }]}>{label}</Text>
        {!!sub && <View>{sub}</View>}
      </View>
      <Text style={[fin.rowValue, strong && { fontSize: 15 }, color && { color }]}>{value}</Text>
    </View>
  );
}

export function Kpi({ label, value, note, color }) {
  return (
    <View style={[fin.card, { flex: 1, minWidth: "46%" }]}>
      <Text style={fin.muted}>{label}</Text>
      <Text style={{ color: color || COLORS.primary, fontWeight: "800", fontSize: 18 }}>{value}</Text>
      {!!note && <Text style={fin.muted}>{note}</Text>}
    </View>
  );
}

export function LevelChip({ level, levels }) {
  if (!level) return null;
  const color = { FUERTE: COLORS.success, FAVORABLE: COLORS.primary, OBSERVACION: COLORS.warning, DEBIL: COLORS.danger }[level] || COLORS.muted;
  return (
    <Chip compact style={{ backgroundColor: COLORS.bg }} textStyle={{ color, fontWeight: "700", fontSize: 11 }}>
      {levels?.[level]?.label || level}
    </Chip>
  );
}

export function Loading() {
  return <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />;
}

export function ErrorBox({ message, onRetry }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={fin.error}>{message}</Text>
      {onRetry && (
        <Button mode="outlined" onPress={onRetry} style={{ marginTop: SPACING.sm }}>
          Reintentar
        </Button>
      )}
    </View>
  );
}

export const pct = (v, digits = 2) => (v == null ? "—" : `${Number(v).toFixed(digits)}%`);
