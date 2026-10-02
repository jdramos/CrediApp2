import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Chip, IconButton, ActivityIndicator } from "react-native-paper";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getMyLoanActions } from "../api/collectionsApi";
import { money } from "../utils/format";
import { actionTypeLabel, resultLabel, stageLabel } from "../utils/collectionsCatalog";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  kind: { fontWeight: "800", color: COLORS.text },
  muted: { color: COLORS.muted, fontSize: 12 },
  notes: { color: COLORS.text },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  footnote: { color: COLORS.muted, fontSize: 12, textAlign: "center", marginTop: SPACING.sm },
});

const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

// Estado de verificación de una visita (lo calcula el backend, ver
// visitVerification en collectionsController.js) -> texto y colores del chip.
function verificationChip(item, radius) {
  switch (item.visit_verification) {
    case "VERIFIED":
      return {
        icon: "map-marker-check",
        label: `Verificada (a ${formatDistance(item.visit_distance_meters)})`,
        bg: COLORS.successSoft,
        fg: COLORS.success,
      };
    case "FAR":
      return {
        icon: "map-marker-alert",
        label: `Lejos del domicilio (${formatDistance(item.visit_distance_meters)})`,
        bg: COLORS.dangerSoft,
        fg: COLORS.danger,
      };
    case "NO_GPS":
      return { icon: "map-marker-off", label: "Sin ubicación GPS", bg: COLORS.warningSoft, fg: COLORS.warning };
    case "NO_CUSTOMER_LOCATION":
      return {
        icon: "map-marker-question",
        label: "Cliente sin ubicación guardada",
        bg: COLORS.primarySoft,
        fg: COLORS.primary,
      };
    default:
      return null;
  }
}

// Historial de gestiones de cobro de un crédito de MI cartera (visitas,
// llamadas, promesas), con el estado de verificación GPS de cada visita.
export default function LoanActionsScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const { session } = useContext(SessionContext);
  const [rows, setRows] = useState([]);
  const [radius, setRadius] = useState(150);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError("");
        try {
          const res = await getMyLoanActions(session.token, params.loanId);
          if (cancelled) return;
          setRows(res?.data || []);
          if (res?.verify_radius_meters) setRadius(res.verify_radius_meters);
        } catch (e) {
          if (!cancelled) setError(e?.message || "No se pudo cargar el historial.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [session.token, params.loanId]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="titleLarge" style={styles.title}>Historial de gestiones</Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} color={COLORS.primary} />}
      {!!error && <Text style={[styles.empty, { color: COLORS.danger }]}>{error}</Text>}

      {!loading && !error && (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.empty}>Este crédito todavía no tiene gestiones registradas.</Text>}
          ListFooterComponent={
            rows.some((r) => r.visit_verification) ? (
              <Text style={styles.footnote}>
                Una visita se considera verificada si se registró a {radius} m o menos de la casa o el negocio del
                cliente.
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const chip = verificationChip(item, radius);
            return (
              <View style={styles.card}>
                <View style={styles.top}>
                  <Text style={styles.kind}>{actionTypeLabel(item.action_type)}</Text>
                  <Text style={styles.muted}>{String(item.action_date).slice(0, 10)}</Text>
                </View>
                <Text style={styles.muted}>
                  {[resultLabel(item.result), stageLabel(item.stage)].filter(Boolean).join(" · ")}
                  {item.created_by_name ? ` · ${item.created_by_name}` : ""}
                </Text>
                {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                {item.promised_amount != null && item.promised_date ? (
                  <Text style={styles.muted}>
                    Promesa: {money(item.promised_amount)} para el {String(item.promised_date).slice(0, 10)} (
                    {{ PENDING: "pendiente", KEPT: "cumplida", BROKEN: "rota" }[item.promise_status] || item.promise_status}
                    )
                  </Text>
                ) : null}
                {chip && (
                  <Chip
                    compact
                    icon={chip.icon}
                    style={{ alignSelf: "flex-start", backgroundColor: chip.bg, marginTop: SPACING.xs }}
                    textStyle={{ color: chip.fg, fontWeight: "700" }}
                  >
                    {chip.label}
                  </Chip>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
