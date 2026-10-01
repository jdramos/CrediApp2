import React, { useCallback, useContext, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Card, Chip, Button, ActivityIndicator, HelperText, IconButton } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { SessionContext } from "../auth/SessionContext";
import { getAssignedLoans, logVisit } from "../api/collectionsApi";
import { isNetworkError } from "../api/credimasterClient";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import { confirmAction } from "../utils/confirm";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2, paddingHorizontal: SPACING.lg },
  searchWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 110, gap: SPACING.sm },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  balancesRow: { flexDirection: "row", gap: SPACING.lg, marginTop: SPACING.sm },
  balanceLabel: { color: COLORS.muted, fontSize: 11 },
  balanceValue: { color: COLORS.text, fontWeight: "700" },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  actionsRow: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.md },
  actionBtn: { flex: 1, borderRadius: RADIUS.md },
  actionBtnLabel: { fontSize: 11, marginVertical: 6 },
});

export default function ClientPortfolioScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();

  const [search, setSearch] = useState("");
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [visitedIds, setVisitedIds] = useState(new Set());
  const [visitingId, setVisitingId] = useState(null);

  const canLogVisit = session?.permissions?.includes("cobranza.gestionar");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getAssignedLoans(session.token, { search: search.trim() || undefined });
      setLoans(res?.data || []);
      setMessage(res?.message || "");
    } catch (e) {
      setError(e?.message ?? "Error cargando tu cartera");
    } finally {
      setLoading(false);
    }
  }, [session.token, search]);

  useFocusEffect(useCallback(() => { setVisitedIds(new Set()); load(); }, [load]));

  const overdueSummary = useMemo(() => {
    const overdue = loans.filter((l) => Number(l.days_overdue) > 0);
    const amount = overdue.reduce(
      (sum, l) => sum + Number(l.principal_balance || 0) + Number(l.interest_balance || 0),
      0,
    );
    return { count: overdue.length, amount };
  }, [loans]);

  const goToPay = (item) => {
    navigation.navigate("PaymentsHome", {
      prefill: {
        customerId: item.customer_id,
        customerName: item.customer_name,
        customerIdentification: item.customer_identification,
        loanId: item.loan_id,
      },
    });
  };

  const callCustomer = (item) => {
    const phone = item.cellphone || item.telephone;
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const markVisited = (item) => {
    confirmAction(
      "Marcar visitado",
      `¿Registrar que visitaste hoy a ${item.customer_name || "este cliente"}?`,
      async () => {
        // Fijado ANTES del intento de red: si hay que encolar por falta de
        // señal, la fecha debe ser la de la visita real, no la del momento
        // en que se sincronice horas después.
        const actionDate = new Date().toISOString().slice(0, 10);

        // La ubicación es best-effort: si el cobrador niega el permiso, el
        // GPS está apagado, o tarda demasiado, la visita se registra igual
        // sin coordenadas -- el backend la compara contra la casa/negocio
        // guardados del cliente para verificar que realmente estuvo ahí,
        // pero esa verificación no puede bloquear el registro en sí.
        let visitLat = null;
        let visitLng = null;
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            visitLat = position.coords.latitude;
            visitLng = position.coords.longitude;
          }
        } catch {
          // sin ubicación, se sigue igual
        }

        try {
          setVisitingId(item.loan_id);
          await logVisit(session.token, {
            loan_id: item.loan_id,
            action_date: actionDate,
            visit_lat: visitLat,
            visit_lng: visitLng,
          });
          setVisitedIds((prev) => new Set(prev).add(item.loan_id));
        } catch (e) {
          if (isNetworkError(e)) {
            try {
              await enqueue({
                type: "VISIT",
                label: `Visita — ${item.customer_name || "cliente"}`,
                payload: { loan_id: item.loan_id, action_date: actionDate, visit_lat: visitLat, visit_lng: visitLng },
              });
              refreshPendingCount();
              setVisitedIds((prev) => new Set(prev).add(item.loan_id));
              Alert.alert("Sin conexión", "La visita se guardó en el equipo y se registrará sola cuando vuelva la señal.");
            } catch (queueErr) {
              setError(queueErr?.message ?? "No se pudo guardar la visita para registrarla después");
            }
            return;
          }
          setError(e?.message ?? "No se pudo registrar la visita");
        } finally {
          setVisitingId(null);
        }
      },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Mi cartera</Text>
      </View>
      <Text style={styles.sub}>
        {loans.length} cliente{loans.length === 1 ? "" : "s"} asignado{loans.length === 1 ? "" : "s"}
        {overdueSummary.count > 0 ? ` · ${overdueSummary.count} en mora (${money(overdueSummary.amount)})` : ""}
      </Text>

      <View style={styles.searchWrap}>
        <TextInput
          mode="outlined"
          placeholder="Buscar por nombre, cédula o # de crédito"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          autoCapitalize="none"
          style={{ backgroundColor: COLORS.card }}
          outlineStyle={{ borderRadius: RADIUS.md }}
          left={<TextInput.Icon icon="magnify" />}
        />
      </View>

      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>
      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {!loading && !!message && loans.length === 0 && (
        <Text style={styles.empty}>{message}</Text>
      )}

      {!loading && (
        <FlatList
          data={loans}
          keyExtractor={(item) => String(item.loan_id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={!message ? <Text style={styles.empty}>No tenés clientes asignados con estos filtros.</Text> : null}
          renderItem={({ item }) => {
            const inArrears = item.days_overdue != null && Number(item.days_overdue) > 0;
            const phone = item.cellphone || item.telephone;
            const visited = visitedIds.has(item.loan_id);
            return (
              <Card style={styles.row} onPress={() => navigation.navigate("AccountStatement", { loanId: item.loan_id })}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.customer_name || "Cliente"}</Text>
                  {inArrears ? (
                    <Chip compact style={{ backgroundColor: COLORS.dangerSoft }} textStyle={{ color: COLORS.danger, fontWeight: "700" }}>
                      Mora {item.days_overdue}d
                    </Chip>
                  ) : (
                    <Chip compact style={{ backgroundColor: COLORS.successSoft }} textStyle={{ color: COLORS.success, fontWeight: "700" }}>
                      Al día
                    </Chip>
                  )}
                </View>
                <Text style={styles.muted}>Código: {item.customer_identification} · Crédito #{item.credit_code || item.loan_id}</Text>
                <View style={styles.balancesRow}>
                  <View>
                    <Text style={styles.balanceLabel}>Próxima cuota</Text>
                    <Text style={styles.balanceValue}>
                      {item.installment_amount != null ? money(item.installment_amount) : "—"}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.balanceLabel}>Saldo capital</Text>
                    <Text style={styles.balanceValue}>{money(item.principal_balance)}</Text>
                  </View>
                  <View>
                    <Text style={styles.balanceLabel}>Saldo interés</Text>
                    <Text style={styles.balanceValue}>{money(item.interest_balance)}</Text>
                  </View>
                </View>
                <View style={styles.actionsRow}>
                  <Button compact mode="outlined" icon="cash-fast" onPress={() => goToPay(item)} style={styles.actionBtn} labelStyle={styles.actionBtnLabel}>
                    Pagar
                  </Button>
                  <Button
                    compact
                    mode="outlined"
                    icon="phone-outline"
                    onPress={() => callCustomer(item)}
                    disabled={!phone}
                    style={styles.actionBtn}
                    labelStyle={styles.actionBtnLabel}
                  >
                    Llamar
                  </Button>
                  {canLogVisit && (
                    <Button
                      compact
                      mode={visited ? "contained" : "outlined"}
                      icon={visited ? "check-circle" : "map-marker-check-outline"}
                      onPress={() => markVisited(item)}
                      loading={visitingId === item.loan_id}
                      disabled={visited || visitingId === item.loan_id}
                      style={styles.actionBtn}
                      labelStyle={styles.actionBtnLabel}
                    >
                      {visited ? "Visitado" : "Visitar"}
                    </Button>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
