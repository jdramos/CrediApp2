import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Chip, ActivityIndicator } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getTeamCollectorDetail } from "../api/collectionsApi";
import { money } from "../utils/format";
import { resultLabel } from "../utils/collectionsCatalog";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const PERIOD_LABEL = { today: "hoy", week: "esta semana", month: "este mes" };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm },
  heroTitle: { color: COLORS.onGradient, fontWeight: "800", flex: 1 },
  heroSub: { color: COLORS.onGradientMuted },
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
  item: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm, paddingVertical: 2 },
  itemName: { color: COLORS.text, fontWeight: "600" },
  muted: { color: COLORS.muted, fontSize: 12 },
  value: { color: COLORS.text, fontWeight: "700", textAlign: "right" },
  empty: { color: COLORS.muted, fontSize: 12 },
  error: { textAlign: "center", color: COLORS.danger, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
});

const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

function visitChip(v) {
  switch (v.visit_verification) {
    case "VERIFIED":
      return { icon: "map-marker-check", label: `Verificada (${formatDistance(v.visit_distance_meters)})`, bg: COLORS.successSoft, fg: COLORS.success };
    case "FAR":
      return { icon: "map-marker-alert", label: `Lejos (${formatDistance(v.visit_distance_meters)})`, bg: COLORS.dangerSoft, fg: COLORS.danger };
    case "NO_GPS":
      return { icon: "map-marker-off", label: "Sin GPS", bg: COLORS.warningSoft, fg: COLORS.warning };
    case "NO_CUSTOMER_LOCATION":
      return { icon: "map-marker-question", label: "Cliente sin ubicación", bg: COLORS.primarySoft, fg: COLORS.primary };
    default:
      return null;
  }
}

// Detalle de UN cobrador para el supervisor: créditos en mora (con
// categoría de riesgo), visitas del período con su verificación GPS y los
// pagos que cobró. Se abre desde el ranking de Supervisión.
export default function CollectorDetailScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
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
        setData(await getTeamCollectorDetail(session.token, params.collectorId, params.period));
      } catch (e) {
        setError(e?.message || "No se pudo cargar el detalle del cobrador.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, params.collectorId, params.period],
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const periodText = PERIOD_LABEL[params.period] || "este mes";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.dark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle} numberOfLines={1}>
            {data?.collector?.name || params.collectorName || "Cobrador"}
          </Text>
        </View>
        <Text style={styles.heroSub}>
          {[data?.collector?.branch_name || params.branchName, `Período: ${periodText}`].filter(Boolean).join(" · ")}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {loading && !data ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} /> : null}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {data && (
          <>
            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>
                Créditos en mora ({data.overdue_loans_total})
              </Text>
              {data.overdue_loans.length === 0 && <Text style={styles.empty}>No tiene créditos en mora.</Text>}
              {data.overdue_loans.map((l) => (
                <View key={l.loan_id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{l.customer_name || `Crédito #${l.credit_code}`}</Text>
                    <Text style={styles.muted}>
                      {`${l.classification ? `Cat. ${l.classification} · ` : ""}${l.days_overdue} días · ${l.overdue_installments} cuota${l.overdue_installments === 1 ? "" : "s"} vencida${l.overdue_installments === 1 ? "" : "s"}`}
                    </Text>
                  </View>
                  <Text style={[styles.value, { color: COLORS.danger }]}>{money(l.overdue_amount)}</Text>
                </View>
              ))}
              {data.overdue_loans_total > data.overdue_loans.length && (
                <Text style={styles.muted}>
                  Mostrando los {data.overdue_loans.length} más atrasados de {data.overdue_loans_total}.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Visitas ({periodText})</Text>
              {data.visits.length === 0 && <Text style={styles.empty}>No registró visitas en el período.</Text>}
              {data.visits.map((v) => {
                const chip = visitChip(v);
                return (
                  <View key={v.id} style={{ gap: 2 }}>
                    <View style={styles.item}>
                      <Text style={[styles.itemName, { flex: 1 }]} numberOfLines={1}>
                        {v.customer_name || `Crédito #${v.credit_code}`}
                      </Text>
                      <Text style={styles.muted}>{v.action_date}</Text>
                    </View>
                    <Text style={styles.muted}>{resultLabel(v.result) || "Sin resultado"}</Text>
                    {chip && (
                      <Chip
                        compact
                        icon={chip.icon}
                        style={{ alignSelf: "flex-start", backgroundColor: chip.bg }}
                        textStyle={{ color: chip.fg, fontWeight: "700" }}
                      >
                        {chip.label}
                      </Chip>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Pagos cobrados ({periodText})</Text>
              {data.payments.length === 0 && <Text style={styles.empty}>No cobró pagos en el período.</Text>}
              {data.payments.map((p) => (
                <View key={p.id} style={styles.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{p.customer_name || `Crédito #${p.credit_code}`}</Text>
                    <Text style={styles.muted}>{`${p.payment_date} · ${p.forma_pago_name}`}</Text>
                  </View>
                  <Text style={[styles.value, { color: COLORS.success }]}>{money(p.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
