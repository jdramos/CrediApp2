import React, { useCallback, useContext, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Chip, ActivityIndicator, ProgressBar } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getTeamProductivity } from "../api/collectionsApi";
import { getMissingWorkdayToday } from "../api/trackingApi";
import OfflineNotice from "../components/OfflineNotice";
import { cachedFetch } from "../offline/cache";
import { money } from "../utils/format";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const PERIODS = [
  ["today", "Hoy"],
  ["week", "Semana"],
  ["month", "Mes"],
];

const SORTS = [
  ["collected", "Cobrado"],
  ["effectiveness", "Meta %"],
  ["overdue", "Mora"],
  ["custody", "Efectivo"],
];

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
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, alignItems: "center" },
  chipsLabel: { color: COLORS.muted, fontSize: 12, marginRight: SPACING.xs },
  tiles: { flexDirection: "row", gap: SPACING.sm },
  tile: { flex: 1, borderRadius: RADIUS.md, padding: SPACING.md },
  tileLabel: { fontSize: 12, fontWeight: "600" },
  tileValue: { fontWeight: "800", marginTop: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: COLORS.primary, fontWeight: "800" },
  name: { color: COLORS.text, fontWeight: "800", flex: 1 },
  muted: { color: COLORS.muted, fontSize: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  label: { color: COLORS.muted, flexShrink: 1 },
  value: { color: COLORS.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  alertBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  alertTitle: { color: COLORS.danger, fontWeight: "800", flex: 1 },
  missingBox: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  missingTitle: { color: COLORS.warning, fontWeight: "800", flex: 1 },
  missingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  alertRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xs },
  alertName: { color: COLORS.text, fontWeight: "700", flex: 1 },
  alertCount: { color: COLORS.danger, fontWeight: "700" },
});

// Chip de selección con estado bien visible: el seleccionado va relleno en el
// color primario con texto blanco y un check; los demás, solo con borde. (El
// estilo "selected" por defecto de Paper apenas cambia el fondo y no se nota.)
function SelectChip({ label, active, onPress }) {
  return (
    <Chip
      mode={active ? "flat" : "outlined"}
      icon={active ? "check" : undefined}
      onPress={onPress}
      style={{ backgroundColor: active ? COLORS.primary : COLORS.card, borderColor: active ? COLORS.primary : COLORS.border }}
      textStyle={{ color: active ? COLORS.onGradient : COLORS.text, fontWeight: active ? "700" : "500" }}
      theme={{ colors: { onSurfaceVariant: active ? COLORS.onGradient : COLORS.muted } }}
    >
      {label}
    </Chip>
  );
}

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

// Vista de SUPERVISOR: ranking de los cobradores de las sucursales del
// usuario (cobrado contra meta del período, mora, riesgo y visitas). El
// backend (GET /api/collections/team-productivity) ya aplica el alcance de
// sucursales y exige creditos.productividad.ver.
export default function TeamProductivityScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [period, setPeriod] = useState("month");
  const [sort, setSort] = useState("collected");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState(null);
  // Con actividad hoy y sin jornada iniciada (aviso "sin ruta"); vacío si no hay o no se pudo consultar
  const [missingToday, setMissingToday] = useState([]);

  const load = useCallback(
    async (p, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const res = await cachedFetch(`${session.user.id}:team:${p}`, () => getTeamProductivity(session.token, { period: p }));
        setData(res.data);
        setCachedAt(res.cachedAt);
        // Best-effort: pide el permiso rastreo.ver (distinto de el de este ranking) y
        // necesita señal; si falla, simplemente no se muestra el aviso.
        getMissingWorkdayToday(session.token)
          .then((r) => setMissingToday(r?.data || []))
          .catch(() => setMissingToday([]));
      } catch (e) {
        setError(e?.message || "No se pudo cargar el ranking. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, session.user.id],
  );

  useFocusEffect(useCallback(() => { load(period); }, [load, period]));

  const ranked = useMemo(() => {
    const rows = [...(data?.data || [])];
    if (sort === "effectiveness") rows.sort((a, b) => (b.effectiveness_pct ?? -1) - (a.effectiveness_pct ?? -1));
    else if (sort === "overdue") rows.sort((a, b) => b.overdue_amount - a.overdue_amount);
    else if (sort === "custody") rows.sort((a, b) => (b.custody_pending ?? -1) - (a.custody_pending ?? -1));
    else rows.sort((a, b) => b.collected_amount - a.collected_amount);
    return rows;
  }, [data, sort]);

  const s = data?.summary;
  const flagged = (data?.data || []).filter((r) => r.visit_alert?.flagged);
  const periodLabel = PERIODS.find(([k]) => k === period)?.[1] || "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.dark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle}>Supervisión de cobradores</Text>
        </View>
        <Text style={styles.heroLabel}>{`Cobrado (${periodLabel.toLowerCase()})`}</Text>
        <Text variant="headlineMedium" style={styles.heroAmount}>{money(s?.total_collected || 0)}</Text>
        <Text style={styles.heroSub}>
          {s ? `${s.collectors_count} cobradores · ${s.total_payments} pagos` : " "}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(period, true)} />}
      >
        <View style={styles.chipsRow}>
          <Text style={styles.chipsLabel}>Período</Text>
          {PERIODS.map(([k, label]) => (
            <SelectChip key={k} label={label} active={period === k} onPress={() => setPeriod(k)} />
          ))}
        </View>
        <View style={styles.chipsRow}>
          <Text style={styles.chipsLabel}>Ordenar por</Text>
          {SORTS.map(([k, label]) => (
            <SelectChip key={k} label={label} active={sort === k} onPress={() => setSort(k)} />
          ))}
        </View>

        <OfflineNotice cachedAt={cachedAt} />
        {loading && !data ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} /> : null}
        {!!error && <Text style={[styles.empty, { color: COLORS.danger }]}>{error}</Text>}

        {missingToday.length > 0 && (
          <View style={styles.missingBox}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
              <MaterialCommunityIcons name="map-marker-off" size={18} color={COLORS.warning} />
              <Text style={styles.missingTitle}>
                {missingToday.length} cobrador{missingToday.length === 1 ? "" : "es"} con actividad hoy sin jornada iniciada
              </Text>
            </View>
            <Text style={styles.muted}>Cobraron o registraron gestiones, pero no iniciaron su ruta del día.</Text>
            {missingToday.map((u) => (
              <View key={u.user_id} style={styles.missingRow}>
                <Text style={styles.alertName} numberOfLines={1}>{u.user_name}</Text>
                <Text style={styles.muted}>
                  {u.payments_count} pago{u.payments_count === 1 ? "" : "s"} · {u.actions_count} gestion
                  {u.actions_count === 1 ? "" : "es"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {flagged.length > 0 && (
          <View style={styles.alertBox}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
              <MaterialCommunityIcons name="map-marker-alert" size={18} color={COLORS.danger} />
              <Text style={styles.alertTitle}>
                {flagged.length} cobrador{flagged.length === 1 ? "" : "es"} con visitas sospechosas esta semana
              </Text>
            </View>
            <Text style={styles.muted}>
              Tres o más visitas registradas lejos del domicilio del cliente en los últimos 7 días.
            </Text>
            {flagged.map((r) => (
              <Pressable
                key={r.collector_id}
                style={styles.alertRow}
                onPress={() =>
                  navigation.navigate("CollectorDetail", {
                    collectorId: r.collector_id,
                    collectorName: r.collector_name,
                    branchName: r.branch_name,
                    period: "week",
                  })
                }
              >
                <Text style={styles.alertName} numberOfLines={1}>{r.collector_name}</Text>
                <Text style={styles.alertCount}>{r.visit_alert.far_7d} de {r.visit_alert.total_7d} lejos</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.muted} />
              </Pressable>
            ))}
          </View>
        )}

        {data && s && (
          <>
            {s.total_custody != null && (
              <View style={styles.tiles}>
                <Tile label="Efectivo sin entregar (todos)" value={money(s.total_custody)} tone="warning" />
              </View>
            )}
            <View style={styles.tiles}>
              <Tile
                label="Meta del período"
                value={s.effectiveness_pct != null ? `${s.effectiveness_pct}%` : "—"}
                tone={s.effectiveness_pct != null && s.effectiveness_pct >= 80 ? "success" : "warning"}
              />
              <Tile label="En mora" value={money(s.overdue_amount)} tone="danger" />
            </View>
            <View style={styles.tiles}>
              <Tile label="Meta de cobro" value={money(s.total_goal)} tone="primary" />
              <Tile label="Cartera en riesgo" value={`${s.par_pct}%`} tone={s.par_pct > 10 ? "danger" : "warning"} />
            </View>
          </>
        )}

        {data && ranked.length === 0 && !error && (
          <Text style={styles.empty}>No hay cobradores con cartera o actividad en tus sucursales.</Text>
        )}

        {ranked.map((r, i) => (
          <Pressable
            key={r.collector_id}
            style={styles.card}
            onPress={() =>
              navigation.navigate("CollectorDetail", {
                collectorId: r.collector_id,
                collectorName: r.collector_name,
                branchName: r.branch_name,
                period,
              })
            }
          >
            <View style={styles.cardTop}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>{r.collector_name}</Text>
              <IconButton icon="chevron-right" size={20} style={{ margin: 0 }} />
            </View>
            {!!r.branch_name && <Text style={styles.muted}>{r.branch_name}</Text>}

            <Row label="Cobrado" value={money(r.collected_amount)} color={COLORS.success} />
            <Row label="Meta" value={money(r.goal_amount)} />
            {r.effectiveness_pct != null && (
              <>
                <Row label="Avance de la meta" value={`${r.effectiveness_pct}%`} color={effColor(r.effectiveness_pct)} />
                <ProgressBar
                  progress={Math.min(r.effectiveness_pct, 100) / 100}
                  color={effColor(r.effectiveness_pct)}
                  style={{ height: 6, borderRadius: 3 }}
                />
              </>
            )}
            <Row label="Créditos / en mora" value={`${r.loans_count} / ${r.loans_overdue}`} />
            <Row label="Mora" value={money(r.overdue_amount)} color={r.overdue_amount > 0 ? COLORS.danger : undefined} />
            <Row label="Cartera en riesgo" value={`${r.par_pct}%`} color={r.par_pct > 10 ? COLORS.danger : undefined} />
            {r.custody_pending != null && (
              <>
                <Row
                  label="Efectivo sin entregar"
                  value={money(r.custody_pending)}
                  color={r.custody_pending > 0 ? COLORS.warning : undefined}
                />
                <Text style={styles.muted}>
                  {r.last_settlement_date ? `Última liquidación: ${r.last_settlement_date}` : "Todavía no ha liquidado (arqueo o depósito)"}
                </Text>
              </>
            )}
            <Row
              label="Visitas verificadas"
              value={r.visits.total > 0 ? `${r.visits.verified} de ${r.visits.total}` : "—"}
              color={r.visits.far > 0 ? COLORS.warning : undefined}
            />
            {r.visits.far > 0 && (
              <Text style={[styles.muted, { color: COLORS.warning }]}>
                {r.visits.far} visita{r.visits.far === 1 ? "" : "s"} lejos del domicilio
              </Text>
            )}
            <Text style={[styles.muted, { color: COLORS.primary, textAlign: "right" }]}>Ver detalle</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
