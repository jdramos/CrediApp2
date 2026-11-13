import React, { useContext, useEffect, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, ActivityIndicator, HelperText, Chip, Button } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { getCustomerCreditHistory } from "../api/customerApi";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Historial crediticio del cliente (pestaña Historial crediticio de la web): calificación interna del comportamiento de
// pago, resumen y cada crédito con su puntualidad. Permiso clientes.ver; necesita señal.

const RATING = {
  EXCELENTE: { label: "Excelente", color: COLORS.success, text: "Paga a tiempo; nunca se ha atrasado más de 7 días." },
  BUENO: { label: "Bueno", color: COLORS.primary, text: "Atrasos ocasionales y cortos, nunca mayores a 30 días." },
  REGULAR: { label: "Regular", color: COLORS.warning, text: "Ha tenido atrasos de 31 a 90 días." },
  MALO: { label: "Malo", color: COLORS.danger, text: "Atrasos mayores a 90 días o créditos saneados." },
  SIN_HISTORIAL: { label: "Sin historial", color: COLORS.muted, text: "Todavía no tiene cuotas vencidas para evaluar." },
};

const STATUS = {
  DISBURSED: { label: "Vigente", color: COLORS.primary },
  CANCELLED: { label: "Cancelado", color: COLORS.success },
  C: { label: "Cancelado", color: COLORS.success },
  WRITTEN_OFF: { label: "Saneado", color: COLORS.danger },
  APPROVED: { label: "Aprobado", color: COLORS.primary },
  PENDING: { label: "En trámite", color: COLORS.warning },
  DRAFT: { label: "Borrador", color: COLORS.muted },
  REJECTED: { label: "Rechazado", color: COLORS.muted },
};

const dmy = (iso) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : "—";
};
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(0)}%`);
const monthYear = (iso) => {
  const [y, m] = String(iso || "").slice(0, 7).split("-");
  return m ? `${m}/${y}` : "—";
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  title: { fontWeight: "800", color: COLORS.text },
  muted: { color: COLORS.muted },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, gap: SPACING.sm },
  rowLabel: { color: COLORS.muted, flexShrink: 1 },
  rowValue: { color: COLORS.text, fontWeight: "600", textAlign: "right" },
});

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function CustomerCreditHistoryScreen({ route }) {
  const { customerId, customerName } = route.params;
  const { session } = useContext(SessionContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getCustomerCreditHistory(session.token, customerId);
      setData(res?.data || null);
    } catch (e) {
      setError(e?.message ?? "No se pudo cargar el historial");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, session.token]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", padding: SPACING.lg }]}>
        <HelperText type="error" visible>{error || "Sin datos"}</HelperText>
        <Button mode="contained" onPress={load} style={{ alignSelf: "center" }}>Reintentar</Button>
      </SafeAreaView>
    );
  }

  const s = data.summary || {};
  const rating = RATING[s.rating] || RATING.SIN_HISTORIAL;
  const loans = Array.isArray(data.loans) ? data.loans : [];

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {!!customerName && <Text variant="titleLarge" style={styles.title}>{customerName}</Text>}

        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm }}>
            <Text style={styles.title}>Calificación del comportamiento</Text>
            <Chip compact textStyle={{ color: rating.color, fontWeight: "800" }} style={{ backgroundColor: COLORS.bg }}>
              {rating.label}
            </Chip>
          </View>
          <Text style={[styles.muted, { marginTop: SPACING.xs }]}>
            {s.customer_since
              ? `Cliente desde ${monthYear(s.customer_since)} (${s.months_as_customer} ${s.months_as_customer === 1 ? "mes" : "meses"}). ${rating.text}`
              : rating.text}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.title, { marginBottom: SPACING.xs }]}>Resumen</Text>
          <Row label="Créditos" value={`${s.loans ?? 0} (${s.active_loans ?? 0} vigentes, ${s.paid_off_loans ?? 0} cancelados)`} />
          {Number(s.written_off_loans) > 0 && <Row label="Saneados" value={s.written_off_loans} />}
          {Number(s.in_process_loans) > 0 && <Row label="En trámite" value={s.in_process_loans} />}
          <Row label="Total desembolsado" value={money(s.total_disbursed)} />
          <Row label="Saldo actual" value={money(s.current_balance)} />
          <Row label="Puntualidad" value={pct(s.on_time_pct)} />
          <Row label="Atraso promedio" value={s.avg_days_late == null ? "—" : `${Number(s.avg_days_late).toFixed(1)} días`} />
          <Row label="Mayor atraso" value={s.max_days_late == null ? "—" : `${s.max_days_late} días`} />
          <Row label="Atraso actual" value={`${s.current_days_late ?? 0} días`} />
        </View>

        <Text style={styles.title}>Créditos ({loans.length})</Text>
        {loans.length === 0 && <Text style={styles.muted}>Este cliente no tiene créditos.</Text>}
        {loans.map((l) => {
          const st = STATUS[l.status] || { label: l.status, color: COLORS.muted };
          const b = l.behavior;
          return (
            <View key={l.id} style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm }}>
                <Text style={styles.title}>Crédito {l.credit_code}</Text>
                <Chip compact textStyle={{ color: st.color, fontWeight: "700", fontSize: 11 }} style={{ backgroundColor: COLORS.bg }}>
                  {st.label}
                </Chip>
              </View>
              {!!l.legacy_credit_code && <Text style={styles.muted}>Número anterior: {l.legacy_credit_code}</Text>}
              <Row label="Monto" value={`${money(l.amount)} · ${l.term} meses${l.frequency ? ` · ${l.frequency}` : ""}`} />
              <Row label="Desembolso" value={dmy(l.disbursement_date || l.request_date)} />
              {!!l.cancellation_date && <Row label="Cancelación" value={dmy(l.cancellation_date)} />}
              {!!l.writeoff_date && <Row label="Saneamiento" value={`${dmy(l.writeoff_date)}${l.writeoff_amount ? ` · ${money(l.writeoff_amount)}` : ""}`} />}
              {l.status === "DISBURSED" && <Row label="Saldo" value={money(l.balance)} />}
              {!!l.classification && <Row label="Clasificación" value={String(l.classification)} />}
              {b && (
                <>
                  <Row label="Puntualidad" value={pct(b.on_time_pct)} />
                  <Row label="Mayor atraso" value={b.max_days_late == null ? "—" : `${b.max_days_late} días`} />
                  {l.status === "DISBURSED" && Number(l.current_days_late) > 0 && <Row label="Atraso actual" value={`${l.current_days_late} días`} />}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
