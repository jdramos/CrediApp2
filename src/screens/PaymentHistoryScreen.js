import React, { useCallback, useContext, useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, IconButton, Divider, Chip } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SessionContext } from "../auth/SessionContext";
import { getPaymentHistory } from "../api/paymentApi";
import PaymentEvidenceModal from "../components/PaymentEvidenceModal";
import { money } from "../utils/format";
import { todayISO } from "../utils/date";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  title: { fontWeight: "800", color: COLORS.text },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
  },
  summary: { color: COLORS.muted, paddingHorizontal: SPACING.lg, marginTop: SPACING.xs },
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
  amount: { fontWeight: "800", color: COLORS.success, fontSize: 16 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl },
});

const paymentAmount = (p) =>
  Number(p.principal_payment || 0) +
  Number(p.interest_payment || 0) +
  Number(p.insurance_payment || 0) +
  Number(p.fee_payment || 0) +
  Number(p.other_charges_payment || 0) +
  Number(p.defaulted_interest || 0);

export default function PaymentHistoryScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [date, setDate] = useState(todayISO());
  const [showDate, setShowDate] = useState(false);
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [evidenceFor, setEvidenceFor] = useState(null); // pago cuya evidencia se está viendo

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getPaymentHistory(session.token, { dateFrom: date, dateTo: date, pageSize: 100 });
      setPayments(res?.data || []);
      setSummary(res?.summary || null);
    } catch (e) {
      setError(e?.message ?? "Error cargando el historial de pagos");
    } finally {
      setLoading(false);
    }
  }, [session.token, date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = payments.reduce((sum, p) => sum + paymentAmount(p), 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Historial de pagos</Text>
      </View>

      <View style={styles.filterRow}>
        <Button mode="outlined" icon="calendar" onPress={() => setShowDate(true)} style={{ borderRadius: RADIUS.md }}>
          {date}
        </Button>
        <Text style={{ color: COLORS.muted }}>{payments.length} pago{payments.length === 1 ? "" : "s"}</Text>
      </View>
      {showDate && (
        <DateTimePicker
          value={new Date(date)}
          mode="date"
          display="default"
          onChange={(_, selected) => {
            setShowDate(false);
            if (selected) setDate(selected.toISOString().slice(0, 10));
          }}
        />
      )}

      {payments.length > 0 && (
        <Text style={styles.summary}>Total del día: <Text style={{ fontWeight: "800", color: COLORS.text }}>{money(total)}</Text></Text>
      )}

      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>
      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {!loading && (
        <FlatList
          data={payments}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <Divider style={{ opacity: 0 }} />}
          ListEmptyComponent={<Text style={styles.empty}>Sin pagos registrados en esta fecha.</Text>}
          renderItem={({ item }) => (
            <Card
              style={styles.row}
              onPress={item.evidence_photo > 0 || item.evidence_signature > 0 ? () => setEvidenceFor(item) : undefined}
            >
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.customer_name || "Cliente"}</Text>
                <Text style={styles.amount}>{money(paymentAmount(item))}</Text>
              </View>
              <Text style={styles.muted}>Crédito #{item.loan_id} · {item.forma_pago_name || "-"}</Text>
              <Text style={styles.muted}>{item.branch_name || "-"}</Text>
              {(item.evidence_photo > 0 || item.evidence_signature > 0) && (
                <View style={{ flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs }}>
                  {item.evidence_photo > 0 && (
                    <Chip compact icon="camera-outline" style={{ backgroundColor: COLORS.primarySoft }}>Foto</Chip>
                  )}
                  {item.evidence_signature > 0 && (
                    <Chip compact icon="draw" style={{ backgroundColor: COLORS.primarySoft }}>Firma</Chip>
                  )}
                  <Text style={[styles.muted, { alignSelf: "center" }]}>Tocá para ver</Text>
                </View>
              )}
            </Card>
          )}
        />
      )}

      <PaymentEvidenceModal
        paymentId={evidenceFor?.id}
        subtitle={evidenceFor ? `${evidenceFor.customer_name || "Cliente"} — Crédito #${evidenceFor.loan_id}` : ""}
        onDismiss={() => setEvidenceFor(null)}
      />
    </SafeAreaView>
  );
}
