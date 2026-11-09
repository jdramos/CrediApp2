import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, ProgressBar } from "react-native-paper";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  cardTitle: { fontWeight: "800", color: COLORS.text },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  label: { color: COLORS.muted, flexShrink: 1 },
  value: { color: COLORS.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  muted: { color: COLORS.muted, fontSize: 12 },
  tiles: { flexDirection: "row", gap: SPACING.sm },
  tile: { flex: 1, borderRadius: RADIUS.md, padding: SPACING.md },
  tileLabel: { fontSize: 12, fontWeight: "600" },
  tileValue: { fontWeight: "800", marginTop: 2 },
  bars: { flexDirection: "row", alignItems: "flex-end", height: 90, gap: SPACING.xs },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "70%", borderRadius: 4, backgroundColor: COLORS.primary, minHeight: 2 },
  barLabel: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
});

const WEEKDAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const dayLetter = (iso) => WEEKDAY_SHORT[new Date(`${iso}T12:00:00`).getDay()];

function Row({ label, value, color }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function Tile({ label, value, tone }) {
  const palette = {
    danger: { bg: COLORS.dangerSoft, fg: COLORS.danger },
    success: { bg: COLORS.successSoft, fg: COLORS.success },
    primary: { bg: COLORS.primarySoft, fg: COLORS.primary },
    warning: { bg: COLORS.warningSoft, fg: COLORS.warning },
  }[tone || "primary"];
  return (
    <View style={[styles.tile, { backgroundColor: palette.bg }]}>
      <Text style={[styles.tileLabel, { color: palette.fg }]}>{label}</Text>
      <Text variant="titleMedium" style={[styles.tileValue, { color: palette.fg }]}>{value}</Text>
    </View>
  );
}

const effColor = (pct) => (pct >= 80 ? COLORS.success : pct >= 50 ? COLORS.warning : COLORS.danger);

// Gráficos de UN cobrador para el supervisor (los mismos de "Mi productividad"):
// mora y cartera en riesgo, cobrado de los últimos 7 días (barras), meta del mes
// (barra de avance) y antigüedad de la mora por categoría (barras). `data` es la
// respuesta de GET /api/collections/productivity/:collectorId.
export default function CollectorCharts({ data }) {
  const p = data?.portfolio;
  const m = data?.month;
  if (!p || !m) return null;

  const daily = data.daily || [];
  const maxDaily = Math.max(1, ...daily.map((d) => d.amount));
  const aging = data.aging || [];
  const maxAging = Math.max(1, ...aging.map((a) => a.principal));
  const weekTotal = daily.reduce((s, d) => s + d.amount, 0);
  const eff = m.effectiveness_pct;
  const prev = m.previous_period_amount;
  const diffPct = prev > 0 ? Math.round(((m.collected_amount - prev) / prev) * 100) : null;

  return (
    <>
      <View style={styles.tiles}>
        <Tile label="En mora" value={money(p.overdue_amount)} tone="danger" />
        <Tile label="Cartera en riesgo" value={`${p.par_pct}%`} tone={p.par_pct > 10 ? "danger" : "warning"} />
      </View>
      <View style={styles.tiles}>
        <Tile label="Créditos al día" value={String(p.loans_current)} tone="success" />
        <Tile label="Créditos en mora" value={String(p.loans_overdue)} tone="danger" />
      </View>

      <View style={styles.card}>
        <Text variant="titleMedium" style={styles.cardTitle}>Cobrado en los últimos 7 días</Text>
        <View style={styles.bars}>
          {daily.map((d) => (
            <View key={d.date} style={styles.barCol}>
              <View
                style={[
                  styles.bar,
                  { height: `${Math.max(2, (d.amount / maxDaily) * 100)}%`, opacity: d.amount > 0 ? 1 : 0.25 },
                ]}
              />
              <Text style={styles.barLabel}>{dayLetter(d.date)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.muted}>Total de la semana: {money(weekTotal)}</Text>
      </View>

      <View style={styles.card}>
        <Text variant="titleMedium" style={styles.cardTitle}>Meta de cobro del mes</Text>
        <Row label="Cobrado" value={money(m.collected_amount)} color={COLORS.success} />
        <Row label="Meta" value={money(m.goal_amount)} />
        {eff != null && (
          <>
            <Row label="Avance de la meta" value={`${eff}%`} color={effColor(eff)} />
            <ProgressBar progress={Math.min(eff, 100) / 100} color={effColor(eff)} style={{ height: 8, borderRadius: 4 }} />
          </>
        )}
        {m.goal_remaining > 0 ? (
          <Row label="Falta por cobrar" value={money(m.goal_remaining)} color={COLORS.danger} />
        ) : (
          <Row label="Meta" value="¡Cumplida!" color={COLORS.success} />
        )}
        <Row
          label="Mismo período del mes anterior"
          value={diffPct == null ? money(prev) : `${money(prev)} (${diffPct >= 0 ? "+" : ""}${diffPct}%)`}
          color={diffPct == null ? undefined : diffPct >= 0 ? COLORS.success : COLORS.danger}
        />
      </View>

      {aging.length > 0 && (
        <View style={styles.card}>
          <Text variant="titleMedium" style={styles.cardTitle}>Antigüedad de la mora (clasificación)</Text>
          <Text style={styles.muted}>Capital de los créditos en mora, por categoría de riesgo.</Text>
          {aging.map((a) => {
            const bad = a.loans > 0 && (a.key === "D" || a.key === "E" || a.key === "90+");
            return (
              <View key={a.key} style={{ gap: 2 }}>
                <Row
                  label={`${a.label}${a.range_label ? ` · ${a.range_label}` : ""} (${a.loans})`}
                  value={money(a.principal)}
                  color={bad ? COLORS.danger : undefined}
                />
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${(a.principal / maxAging) * 100}%`, backgroundColor: bad ? COLORS.danger : COLORS.primary },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}
