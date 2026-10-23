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
  const text = kind === "pct" ? `${Math.abs(diff).toFixed(2)} pts` : kind === "count" ? String(Math.round(Math.abs(diff))) : money(Math.abs(diff));
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

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const monthShort = (period) => SHORT_MONTHS[Number(String(period).slice(5, 7)) - 1] || "";

// Mini gráfica de barras para una serie de valores (el último es el mes actual).
// Admite negativos (el cero queda en una línea): sirve para ROA, resultados, etc.
// `labels`: etiqueta bajo cada barra (mes).
export function MiniBars({ values, labels, height = 44, color = COLORS.primary, negativeColor = COLORS.danger }) {
  const nums = values.map((v) => (v == null ? 0 : Number(v)));
  const pos = Math.max(0, ...nums);
  const neg = Math.abs(Math.min(0, ...nums));
  const total = pos + neg || 1;
  const zeroY = (pos / total) * height; // distancia desde arriba hasta la línea del cero
  return (
    <View style={{ marginTop: SPACING.xs }}>
      <View style={{ flexDirection: "row", height, gap: 4 }}>
        {nums.map((v, i) => {
          const h = Math.max((Math.abs(v) / total) * height, v === 0 ? 0 : 2);
          const last = i === nums.length - 1;
          return (
            <View key={i} style={{ flex: 1, height }}>
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: h,
                  top: v >= 0 ? zeroY - h : zeroY,
                  borderRadius: 2,
                  backgroundColor: v < 0 ? negativeColor : color,
                  opacity: last ? 1 : 0.4,
                }}
              />
            </View>
          );
        })}
        {neg > 0 && <View style={{ position: "absolute", left: 0, right: 0, top: zeroY, height: 1, backgroundColor: COLORS.border }} />}
      </View>
      {!!labels && (
        <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
          {labels.map((l, i) => (
            <Text key={i} style={{ flex: 1, textAlign: "center", color: COLORS.muted, fontSize: 9 }}>
              {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// Barras apiladas de la cartera por mes: la altura es la cartera total y la parte
// roja de abajo es la vencida.
export function StackedBars({ rows, height = 90 }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.total) || 0));
  return (
    <View>
      <View style={{ flexDirection: "row", height, gap: 3, alignItems: "flex-end" }}>
        {rows.map((r, i) => {
          const total = ((Number(r.total) || 0) / max) * height;
          const over = Math.min(total, ((Number(r.overdue) || 0) / max) * height);
          const last = i === rows.length - 1;
          return (
            <View key={r.period} style={{ flex: 1, height: Math.max(total, 1), opacity: last ? 1 : 0.55 }}>
              <View style={{ flex: 1, backgroundColor: COLORS.primary, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
              {over > 0 && <View style={{ height: Math.max(over, 1.5), backgroundColor: COLORS.danger }} />}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 3, marginTop: 2 }}>
        {rows.map((r) => (
          <Text key={r.period} style={{ flex: 1, textAlign: "center", color: COLORS.muted, fontSize: 9 }}>
            {monthShort(r.period)}
          </Text>
        ))}
      </View>
    </View>
  );
}
