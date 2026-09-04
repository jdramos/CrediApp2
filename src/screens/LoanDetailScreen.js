import React, { useContext, useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, ActivityIndicator, HelperText, Chip, Divider, IconButton } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getLoanDetail, getLoanAmortization } from "../api/loanApi";
import { getLoanApprovalHistory } from "../api/approvalApi";
import { money } from "../utils/format";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: { padding: SPACING.lg, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg },
  title: { color: COLORS.onGradient, fontWeight: "800" },
  sub: { color: COLORS.onGradientMuted, marginTop: 2 },
  balance: { color: COLORS.onGradient, fontWeight: "800", fontSize: 28, marginTop: SPACING.sm },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.md },
  listContent: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.sm },
  sectionTitle: { fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...SHADOW.card,
  },
  installmentNum: { fontWeight: "700", color: COLORS.text },
  installmentDate: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  installmentAmount: { fontWeight: "700", color: COLORS.text, textAlign: "right" },
});

const STATUS_COLOR = { PAID: COLORS.success, PARTIAL: COLORS.warning, PENDING: COLORS.muted };
const STATUS_LABEL = { PAID: "Pagada", PARTIAL: "Parcial", PENDING: "Pendiente" };

const APPROVAL_STATUS_COLOR = { APPROVED: COLORS.success, REJECTED: COLORS.danger, PENDING: COLORS.warning };
const APPROVAL_STATUS_LABEL = { APPROVED: "Aprobó", REJECTED: "Rechazó", PENDING: "Pendiente" };

const installmentTotal = (row) =>
  Number(row.payment_principal || 0) +
  Number(row.payment_interest || 0) +
  Number(row.payment_insurance || 0) +
  Number(row.payment_fee || 0) +
  Number(row.payment_other_charges || 0);

export default function LoanDetailScreen({ route }) {
  const { loanId } = route.params;
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);

  const [loan, setLoan] = useState(null);
  const [rows, setRows] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const [detailRes, amortRes] = await Promise.all([
          getLoanDetail(session.token, loanId),
          getLoanAmortization(session.token, loanId),
        ]);
        setLoan(detailRes?.data || null);
        setRows(Array.isArray(amortRes) ? amortRes : amortRes?.data || []);
      } catch (e) {
        setError(e?.message ?? "Error cargando el crédito");
      } finally {
        setLoading(false);
      }
    })();

    // Best-effort: requiere permiso aprobaciones.ver, que un usuario que
    // solo somete solicitudes puede no tener.
    getLoanApprovalHistory(session.token, loanId)
      .then((rows2) => setApprovals(Array.isArray(rows2) ? rows2 : []))
      .catch(() => setApprovals([]));
  }, [loanId, session.token]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <IconButton
          icon="arrow-left"
          iconColor={COLORS.onGradient}
          onPress={() => navigation.goBack()}
          style={{ margin: 0, marginLeft: -SPACING.sm, marginBottom: -SPACING.xs }}
        />
        <Text variant="headlineSmall" style={styles.title}>Crédito #{loanId}</Text>
        <Text style={styles.sub}>{loan?.customer_name || "-"}</Text>
        <Text style={styles.balance}>{money(loan?.current_balance)}</Text>
        <Text style={styles.sub}>Saldo pendiente</Text>
        <View style={styles.metaRow}>
          {!!loan?.status && (
            <Chip compact style={{ backgroundColor: "rgba(255,255,255,0.18)" }} textStyle={{ color: COLORS.onGradient }}>
              {loan.status}
            </Chip>
          )}
          {!!loan?.branch_name && (
            <Chip compact style={{ backgroundColor: "rgba(255,255,255,0.18)" }} textStyle={{ color: COLORS.onGradient }}>
              {loan.branch_name}
            </Chip>
          )}
          {!!loan?.frecuency_name && (
            <Chip compact style={{ backgroundColor: "rgba(255,255,255,0.18)" }} textStyle={{ color: COLORS.onGradient }}>
              {loan.frecuency_name}
            </Chip>
          )}
          {!!loan?.source && (
            <Chip
              compact
              icon={loan.source === "MOBILE" ? "cellphone" : "monitor"}
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
              textStyle={{ color: COLORS.onGradient }}
            >
              {loan.source === "MOBILE" ? "App" : "Web"}
            </Chip>
          )}
        </View>
        {!!loan?.created_by_name && (
          <Text style={[styles.sub, { marginTop: SPACING.xs }]}>Solicitado por {loan.created_by_name}</Text>
        )}
      </LinearGradient>

      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>

      <FlatList
        data={rows}
        keyExtractor={(item, idx) => String(item.id ?? idx)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {approvals.length > 0 && (
              <View style={{ marginBottom: SPACING.md }}>
                <Text style={styles.sectionTitle}>Historial de aprobaciones</Text>
                {approvals.map((a) => (
                  <View key={a.id} style={[styles.row, { marginBottom: SPACING.sm }]}>
                    <View>
                      <Text style={styles.installmentNum}>{a.full_name}</Text>
                      {!!a.decision_date && <Text style={styles.installmentDate}>{a.decision_date}</Text>}
                      {!!a.comment && <Text style={styles.installmentDate}>{a.comment}</Text>}
                    </View>
                    <Chip
                      compact
                      style={{ backgroundColor: COLORS.bg }}
                      textStyle={{ color: APPROVAL_STATUS_COLOR[a.status] || COLORS.muted, fontSize: 11 }}
                    >
                      {APPROVAL_STATUS_LABEL[a.status] || a.status}
                    </Chip>
                  </View>
                ))}
              </View>
            )}
            {rows.length > 0 && <Text style={styles.sectionTitle}>Tabla de amortización</Text>}
          </View>
        }
        ItemSeparatorComponent={() => <Divider style={{ opacity: 0 }} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.installmentNum}>Cuota #{item.payment_number}</Text>
              <Text style={styles.installmentDate}>{item.payment_date}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.installmentAmount}>{money(installmentTotal(item))}</Text>
              <Chip
                compact
                style={{ marginTop: 4, backgroundColor: COLORS.bg }}
                textStyle={{ color: STATUS_COLOR[item.status] || COLORS.muted, fontSize: 11 }}
              >
                {STATUS_LABEL[item.status] || item.status}
              </Chip>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
