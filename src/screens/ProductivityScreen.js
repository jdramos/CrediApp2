import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, ActivityIndicator, ProgressBar } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getMyProductivity } from "../api/collectionsApi";
import { money } from "../utils/format";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm },
  heroTitle: { color: COLORS.onGradient, fontWeight: "800", flex: 1 },
  heroLabel: { color: COLORS.onGradientMuted, marginTop: SPACING.sm },
  heroAmount: { color: COLORS.onGradient, fontWeight: "800" },
  heroSub: { color: COLORS.onGradientMuted, marginTop: 2 },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
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
  tiles: { flexDirection: "row", gap: SPACING.sm },
  tile: { flex: 1, borderRadius: RADIUS.md, padding: SPACING.md },
  tileLabel: { fontSize: 12, fontWeight: "600" },
  tileValue: { fontWeight: "800", marginTop: 2 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
});

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

// "Mi productividad": cómo va la cartera del cobrador (saldo, mora,
// vencidos, riesgo, cobrado, efectividad, gestiones). Todo viene calculado
// del backend (GET /api/collections/my-productivity) a partir de las mismas
// cuotas que usa "Mis clientes", así que los montos cuadran entre pantallas.
export default function ProductivityScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        setData(await getMyProductivity(session.token));
      } catch (e) {
        setError(e?.message || "No se pudo cargar tu productividad. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token],
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const p = data?.portfolio;
  const m = data?.month;
  const t = data?.today;
  const linked = data?.linked !== false;
  const effectiveness = m?.effectiveness_pct;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle}>Mi productividad</Text>
        </View>
        <Text style={styles.heroLabel}>Saldo de cartera</Text>
        <Text variant="headlineMedium" style={styles.heroAmount}>{money(p?.principal_balance || 0)}</Text>
        <Text style={styles.heroSub}>
          {p ? `${p.loans_count} créditos · al ${data.as_of}` : " "}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {loading && !data ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} /> : null}
        {!!error && <Text style={[styles.empty, { color: COLORS.danger }]}>{error}</Text>}
        {data && !linked && <Text style={styles.empty}>{data.message}</Text>}

        {data && linked && (
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
              <Text variant="titleMedium" style={styles.cardTitle}>Mora y vencidos</Text>
              <Row label="Capital vencido" value={money(p.overdue_principal)} color={COLORS.danger} />
              <Row label="Interés vencido" value={money(p.overdue_interest)} color={COLORS.danger} />
              <Row label="Total vencido" value={money(p.overdue_amount)} color={COLORS.danger} />
              <Row label="Cuotas vencidas" value={String(p.overdue_installments)} />
              <Row label="Saldo de créditos en mora" value={money(p.at_risk_principal)} />
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Antigüedad de la mora</Text>
              {data.aging.map((a) => (
                <Row
                  key={a.key}
                  label={`${a.label} (${a.loans})`}
                  value={money(a.principal)}
                  color={a.loans > 0 && a.key === "90+" ? COLORS.danger : undefined}
                />
              ))}
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Hoy</Text>
              <Row label="Cobrado hoy" value={`${money(t.collected_amount)} (${t.payments_count} pagos)`} color={COLORS.success} />
              <Row label="Vence hoy" value={`${money(p.due_today_amount)} (${p.due_today_installments} cuotas)`} />
              <Row label="Gestiones de cobro" value={String(t.actions)} />
              <Row label="Visitas" value={String(t.visits)} />
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Este mes</Text>
              <Row label="Cobrado" value={money(m.collected_amount)} color={COLORS.success} />
              <Row label="Esperado (cuotas del mes)" value={money(m.expected_amount)} />
              {effectiveness != null && (
                <>
                  <Row label="Efectividad de cobro" value={`${effectiveness}%`} />
                  <ProgressBar
                    progress={Math.min(effectiveness, 100) / 100}
                    color={effectiveness >= 80 ? COLORS.success : effectiveness >= 50 ? COLORS.warning : COLORS.danger}
                    style={{ height: 8, borderRadius: 4 }}
                  />
                </>
              )}
              <Row label="Pagos recibidos" value={String(m.payments_count)} />
              <Row label="Gestiones / visitas" value={`${m.actions} / ${m.visits}`} />
              <Row
                label="Promesas de pago"
                value={`${m.promises.total} (${m.promises.kept} cumplidas, ${m.promises.broken} rotas, ${m.promises.pending} pendientes)`}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
