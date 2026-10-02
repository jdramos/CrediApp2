import React, { useCallback, useContext, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Linking, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Text,
  TextInput,
  Card,
  Chip,
  Button,
  ActivityIndicator,
  HelperText,
  IconButton,
  Portal,
  Modal,
  Divider,
} from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import { SessionContext } from "../auth/SessionContext";
import { getAssignedLoans, logVisit } from "../api/collectionsApi";
import { isNetworkError } from "../api/credimasterClient";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import { money, toNumber } from "../utils/format";
import { todayISO } from "../utils/date";
import { ACTION_TYPES, RESULTS, STAGES } from "../utils/collectionsCatalog";
import { openDirections } from "../utils/maps";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const emptyGestionForm = {
  action_type: "VISIT",
  action_date: todayISO(),
  result: "CONTACTED",
  stage: "PREVENTIVE",
  notes: "",
  promised_amount: "",
  promised_date: "",
};

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
  const [managedIds, setManagedIds] = useState(new Set());

  const [gestionItem, setGestionItem] = useState(null);
  const [gestionForm, setGestionForm] = useState(emptyGestionForm);
  const [gestionError, setGestionError] = useState("");
  const [savingGestion, setSavingGestion] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPromiseDatePicker, setShowPromiseDatePicker] = useState(false);

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

  useFocusEffect(useCallback(() => { setManagedIds(new Set()); load(); }, [load]));

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

  const openGestion = (item) => {
    setGestionItem(item);
    setGestionForm(emptyGestionForm);
    setGestionError("");
  };

  const closeGestion = () => {
    if (savingGestion) return;
    setGestionItem(null);
  };

  const setG = (field, value) => setGestionForm((prev) => ({ ...prev, [field]: value }));

  const saveGestion = async () => {
    if (!gestionItem) return;
    setGestionError("");

    // La ubicación es best-effort: si el cobrador niega el permiso, el GPS
    // está apagado, o tarda demasiado, la gestión se registra igual sin
    // coordenadas -- el backend las compara contra la casa/negocio
    // guardados del cliente para verificar que realmente estuvo ahí, pero
    // esa verificación no puede bloquear el registro en sí.
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

    const payload = {
      loan_id: gestionItem.loan_id,
      action_type: gestionForm.action_type,
      action_date: gestionForm.action_date,
      result: gestionForm.result,
      stage: gestionForm.stage,
      notes: gestionForm.notes || undefined,
      promised_amount: gestionForm.promised_amount ? toNumber(gestionForm.promised_amount) : undefined,
      promised_date: gestionForm.promised_date || undefined,
      visit_lat: visitLat,
      visit_lng: visitLng,
    };

    try {
      setSavingGestion(true);
      await logVisit(session.token, payload);
      setManagedIds((prev) => new Set(prev).add(gestionItem.loan_id));
      setGestionItem(null);
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await enqueue({
            type: "VISIT",
            label: `${ACTION_TYPES.find(([k]) => k === payload.action_type)?.[1] || "Gestión"} — ${gestionItem.customer_name || "cliente"}`,
            payload,
          });
          refreshPendingCount();
          setManagedIds((prev) => new Set(prev).add(gestionItem.loan_id));
          setGestionItem(null);
          Alert.alert("Sin conexión", "La gestión se guardó en el equipo y se registrará sola cuando vuelva la señal.");
        } catch (queueErr) {
          setGestionError(queueErr?.message ?? "No se pudo guardar la gestión para registrarla después");
        }
        return;
      }
      setGestionError(e?.message ?? "No se pudo registrar la gestión");
    } finally {
      setSavingGestion(false);
    }
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
            const managed = managedIds.has(item.loan_id);
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
                  <Button
                    compact
                    mode="outlined"
                    icon="map-marker-path"
                    onPress={() => openDirections(item)}
                    style={styles.actionBtn}
                    labelStyle={styles.actionBtnLabel}
                  >
                    Ir
                  </Button>
                  {canLogVisit && (
                    <Button
                      compact
                      mode={managed ? "contained" : "outlined"}
                      icon={managed ? "check-circle" : "clipboard-text-outline"}
                      onPress={() => openGestion(item)}
                      style={styles.actionBtn}
                      labelStyle={styles.actionBtnLabel}
                    >
                      {managed ? "Gestionado" : "Gestión"}
                    </Button>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}

      <Portal>
        <Modal
          visible={!!gestionItem}
          onDismiss={closeGestion}
          contentContainerStyle={{
            backgroundColor: COLORS.card,
            margin: SPACING.lg,
            borderRadius: RADIUS.lg,
            padding: SPACING.md,
            maxHeight: "85%",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text }}>
              Gestión de cobro
            </Text>
            <Text style={{ color: COLORS.muted, marginBottom: SPACING.md }}>
              {gestionItem?.customer_name || "Cliente"} — Crédito #{gestionItem?.credit_code || gestionItem?.loan_id}
            </Text>

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>Tipo</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.md }}>
              {ACTION_TYPES.map(([k, label]) => (
                <Chip
                  key={k}
                  selected={gestionForm.action_type === k}
                  onPress={() => setG("action_type", k)}
                  style={{ backgroundColor: gestionForm.action_type === k ? COLORS.primarySoft : COLORS.bg }}
                >
                  {label}
                </Chip>
              ))}
            </View>

            <Button
              mode="outlined"
              onPress={() => setShowDatePicker(true)}
              icon="calendar"
              style={{ marginBottom: SPACING.md, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              {gestionForm.action_date}
            </Button>
            {showDatePicker && (
              <DateTimePicker
                value={new Date(gestionForm.action_date)}
                mode="date"
                display="default"
                onChange={(_, selected) => {
                  setShowDatePicker(false);
                  if (selected) setG("action_date", selected.toISOString().slice(0, 10));
                }}
              />
            )}

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>Resultado</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.md }}>
              {RESULTS.map(([k, label]) => (
                <Chip
                  key={k}
                  selected={gestionForm.result === k}
                  onPress={() => setG("result", k)}
                  style={{ backgroundColor: gestionForm.result === k ? COLORS.primarySoft : COLORS.bg }}
                >
                  {label}
                </Chip>
              ))}
            </View>

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>Etapa</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.md }}>
              {STAGES.map(([k, label]) => (
                <Chip
                  key={k}
                  selected={gestionForm.stage === k}
                  onPress={() => setG("stage", k)}
                  style={{ backgroundColor: gestionForm.stage === k ? COLORS.primarySoft : COLORS.bg }}
                >
                  {label}
                </Chip>
              ))}
            </View>

            <TextInput
              mode="outlined"
              label="Notas"
              value={gestionForm.notes}
              onChangeText={(t) => setG("notes", t)}
              multiline
              numberOfLines={3}
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.md }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />

            <Divider style={{ marginBottom: SPACING.md }} />

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>
              Promesa de pago (opcional)
            </Text>
            <TextInput
              mode="outlined"
              label="Monto prometido"
              value={gestionForm.promised_amount}
              onChangeText={(t) => setG("promised_amount", t)}
              keyboardType="decimal-pad"
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
              left={<TextInput.Icon icon="cash" />}
            />
            <Button
              mode="outlined"
              onPress={() => setShowPromiseDatePicker(true)}
              icon="calendar"
              style={{ marginBottom: SPACING.md, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              {gestionForm.promised_date || "Fecha de promesa"}
            </Button>
            {showPromiseDatePicker && (
              <DateTimePicker
                value={gestionForm.promised_date ? new Date(gestionForm.promised_date) : new Date()}
                mode="date"
                display="default"
                onChange={(_, selected) => {
                  setShowPromiseDatePicker(false);
                  if (selected) setG("promised_date", selected.toISOString().slice(0, 10));
                }}
              />
            )}

            <HelperText type="error" visible={!!gestionError}>{gestionError}</HelperText>

            <Button
              mode="contained"
              onPress={saveGestion}
              loading={savingGestion}
              disabled={savingGestion}
              style={{ borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
              labelStyle={{ fontWeight: "700" }}
            >
              Registrar gestión
            </Button>
          </ScrollView>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}
