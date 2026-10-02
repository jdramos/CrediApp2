import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Share, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Button, ActivityIndicator, ProgressBar } from "react-native-paper";
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
  agendaItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  agendaName: { color: COLORS.text, fontWeight: "600" },
  agendaSub: { color: COLORS.muted, fontSize: 12 },
  subTitle: { fontWeight: "700", color: COLORS.text, marginTop: SPACING.xs },
  bars: { flexDirection: "row", alignItems: "flex-end", height: 90, gap: SPACING.xs },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "70%", borderRadius: 4, backgroundColor: COLORS.primary, minHeight: 2 },
  barLabel: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
});

const WEEKDAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"];
const dayLetter = (iso) => WEEKDAY_SHORT[new Date(`${iso}T12:00:00`).getDay()];
const shortDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function AgendaItem({ title, subtitle, amount, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.agendaItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.agendaName} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.agendaSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <Text style={styles.value}>{money(amount)}</Text>
    </Pressable>
  );
}

// Texto del resumen de cierre del día, pensado para pegarse en WhatsApp.
function buildDaySummaryText({ tenantName, collectorName, data }) {
  const p = data.portfolio;
  const t = data.today;
  const m = data.month;
  const lines = [
    `*Cierre del día ${data.as_of}*`,
    [tenantName, collectorName].filter(Boolean).join(" - "),
    "",
    `Cobrado hoy: ${money(t.collected_amount)} (${t.payments_count} pagos)`,
    `Gestiones: ${t.actions} | Visitas: ${t.visits}`,
    "",
    `Saldo de cartera: ${money(p.principal_balance)}`,
    `En mora: ${money(p.overdue_amount)} (${p.loans_overdue} de ${p.loans_count} créditos)`,
    `Cartera en riesgo: ${p.par_pct}%`,
    "",
    `Cobrado en el mes: ${money(m.collected_amount)} de ${money(m.expected_amount)} esperados` +
      (m.effectiveness_pct != null ? ` (${m.effectiveness_pct}%)` : ""),
  ];
  const pending = data.agenda?.promises?.length || 0;
  if (pending) lines.push(`Promesas de pago pendientes: ${pending}`);
  return lines.filter((l) => l !== undefined).join("\n");
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
  const agenda = data?.agenda;
  const maxDaily = Math.max(1, ...(data?.daily || []).map((d) => d.amount));
  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name || "";
  const collectorName = session?.user?.full_name || session?.user?.user_name || "";

  const openLoan = (loanId) =>
    navigation.navigate("App", {
      screen: "Pagos",
      params: { screen: "AccountStatement", params: { loanId } },
    });

  const onShareSummary = async () => {
    try {
      await Share.share({ message: buildDaySummaryText({ tenantName, collectorName, data }) });
    } catch {
      // El usuario cerró la hoja de compartir o el dispositivo no puede: no es un error para mostrar.
    }
  };

  const prevAmount = m?.previous_period_amount;
  const diffPct =
    prevAmount > 0 ? Math.round(((m.collected_amount - prevAmount) / prevAmount) * 100) : null;

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
            <Button mode="contained-tonal" icon="whatsapp" onPress={onShareSummary} style={{ borderRadius: RADIUS.md }}>
              Compartir resumen del día
            </Button>

            <View style={styles.tiles}>
              <Tile label="En mora" value={money(p.overdue_amount)} tone="danger" />
              <Tile label="Cartera en riesgo" value={`${p.par_pct}%`} tone={p.par_pct > 10 ? "danger" : "warning"} />
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Agenda de hoy</Text>

              <Text style={styles.subTitle}>Vencen hoy ({agenda.due_today.length})</Text>
              {agenda.due_today.length === 0 && <Text style={styles.agendaSub}>No hay cuotas que venzan hoy.</Text>}
              {agenda.due_today.map((r) => (
                <AgendaItem
                  key={`due-${r.loan_id}`}
                  title={r.customer_name || `Crédito #${r.credit_code}`}
                  subtitle={`Crédito #${r.credit_code}`}
                  amount={r.amount}
                  onPress={() => openLoan(r.loan_id)}
                />
              ))}

              <Text style={styles.subTitle}>Promesas de pago pendientes ({agenda.promises.length})</Text>
              {agenda.promises.length === 0 && <Text style={styles.agendaSub}>No hay promesas pendientes.</Text>}
              {agenda.promises.map((r) => (
                <AgendaItem
                  key={`prom-${r.id}`}
                  title={r.customer_name || `Crédito #${r.credit_code}`}
                  subtitle={`Promete para el ${shortDate(r.promised_date)}`}
                  amount={r.promised_amount}
                  onPress={() => openLoan(r.loan_id)}
                />
              ))}

              <Text style={styles.subTitle}>
                Mora sin gestión en {agenda.no_follow_up_days} días ({agenda.no_follow_up_total})
              </Text>
              {agenda.no_follow_up.length === 0 && (
                <Text style={styles.agendaSub}>Todos tus créditos en mora tienen gestión reciente.</Text>
              )}
              {agenda.no_follow_up.map((r) => (
                <AgendaItem
                  key={`nofu-${r.loan_id}`}
                  title={r.customer_name || `Crédito #${r.credit_code}`}
                  subtitle={`${r.days_overdue} días de mora · ${
                    r.last_action_date ? `última gestión ${shortDate(r.last_action_date)}` : "sin gestiones"
                  }`}
                  amount={r.overdue_amount}
                  onPress={() => openLoan(r.loan_id)}
                />
              ))}
              {agenda.no_follow_up_total > agenda.no_follow_up.length && (
                <Text style={styles.agendaSub}>
                  Mostrando los {agenda.no_follow_up.length} más atrasados de {agenda.no_follow_up_total}.
                </Text>
              )}
            </View>
            <View style={styles.tiles}>
              <Tile label="Créditos al día" value={String(p.loans_current)} tone="success" />
              <Tile label="Créditos en mora" value={String(p.loans_overdue)} tone="danger" />
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Cobrado en los últimos 7 días</Text>
              <View style={styles.bars}>
                {data.daily.map((d) => (
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
              <Text style={styles.agendaSub}>
                Total de la semana: {money(data.daily.reduce((s, d) => s + d.amount, 0))}
              </Text>
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
              <Row
                label="Mismo período del mes anterior"
                value={
                  diffPct == null
                    ? money(prevAmount)
                    : `${money(prevAmount)} (${diffPct >= 0 ? "+" : ""}${diffPct}%)`
                }
                color={diffPct == null ? undefined : diffPct >= 0 ? COLORS.success : COLORS.danger}
              />
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
