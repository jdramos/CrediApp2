import React, { useContext, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, Chip, HelperText, Divider } from "react-native-paper";
import Animated, { FadeIn } from "react-native-reanimated";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { decideApproval } from "../api/approvalApi";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  header: { fontWeight: "800", color: COLORS.text },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  amount: { color: COLORS.primary, fontWeight: "800", fontSize: 24, marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs },
});

const subtypeLabel = (item) => {
  if (item.item_type === "LOAN") return "Solicitud nueva";
  const map = { PRORROGA: "Prórroga", REESTRUCTURACION: "Reestructuración", REFINANCIAMIENTO: "Refinanciamiento" };
  return map[item.item_subtype] || "Modificación";
};

export default function ApprovalDecisionScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const item = params?.item;
  const { session } = useContext(SessionContext);

  const canApprove = session?.permissions?.includes("aprobaciones.creditos.aprobar");
  const canReject = session?.permissions?.includes("aprobaciones.creditos.rechazar");

  const [amount, setAmount] = useState(String(item?.requested_amount ?? ""));
  const [term, setTerm] = useState(String(item?.requested_term ?? ""));
  const [rate, setRate] = useState(item?.requested_interest_rate != null ? String(item.requested_interest_rate) : "");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = (status) => {
    Alert.alert(
      status === "APPROVED" ? "Aprobar solicitud" : "Rechazar solicitud",
      `¿Confirmás ${status === "APPROVED" ? "aprobar" : "rechazar"} la solicitud de ${item?.customer_name || "este cliente"}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          style: status === "APPROVED" ? "default" : "destructive",
          onPress: async () => {
            setError("");
            try {
              setSaving(true);
              await decideApproval(session.token, item.approval_id, {
                status,
                amount: amount ? Number(amount) : undefined,
                term: term ? Number(term) : undefined,
                interest_rate: rate ? Number(rate) : undefined,
                comment: comment || undefined,
              });
              navigation.goBack();
            } catch (e) {
              setError(e?.message ?? "No se pudo registrar la decisión");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ padding: SPACING.lg }}>No se encontró la solicitud.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <Animated.View entering={FadeIn}>
          <Text variant="headlineSmall" style={styles.header}>{item.customer_name || "Cliente"}</Text>
          <Text style={styles.amount}>{money(item.requested_amount)}</Text>

          <View style={styles.chipsRow}>
            <Chip compact icon="tag-outline">{subtypeLabel(item)}</Chip>
            {!!item.branch_name && <Chip compact icon="office-building-outline">{item.branch_name}</Chip>}
            {!!item.requires_committee && (
              <Chip compact icon="account-group" style={{ backgroundColor: COLORS.warningSoft }}>Comité de crédito</Chip>
            )}
          </View>

          <View style={[styles.card, { marginTop: SPACING.md }]}>
            <View style={styles.row}>
              <Text style={{ color: COLORS.muted }}>Cédula del cliente</Text>
              <Text style={{ fontWeight: "600" }}>{item.customer_identification || "-"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={{ color: COLORS.muted }}>Plazo solicitado</Text>
              <Text style={{ fontWeight: "600" }}>{item.requested_term ?? "-"} cuotas</Text>
            </View>
            <View style={styles.row}>
              <Text style={{ color: COLORS.muted }}>Tasa solicitada</Text>
              <Text style={{ fontWeight: "600" }}>{item.requested_interest_rate ?? "-"}%</Text>
            </View>
            <View style={styles.row}>
              <Text style={{ color: COLORS.muted }}>Límite de tu aprobación</Text>
              <Text style={{ fontWeight: "600" }}>{item.approver_limit_amount != null ? money(item.approver_limit_amount) : "Sin límite"}</Text>
            </View>
          </View>

          {(canApprove || canReject) && (
            <View style={[styles.card, { marginTop: SPACING.md }]}>
              <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>
                Ajustar términos (opcional)
              </Text>
              <TextInput
                mode="outlined"
                label="Monto a aprobar"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card, marginBottom: SPACING.xs }}
                outlineStyle={{ borderRadius: RADIUS.md }}
              />
              <TextInput
                mode="outlined"
                label="Plazo (cuotas)"
                value={term}
                onChangeText={setTerm}
                keyboardType="number-pad"
                style={{ backgroundColor: COLORS.card, marginBottom: SPACING.xs }}
                outlineStyle={{ borderRadius: RADIUS.md }}
              />
              <TextInput
                mode="outlined"
                label="Tasa de interés (%)"
                value={rate}
                onChangeText={setRate}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card, marginBottom: SPACING.xs }}
                outlineStyle={{ borderRadius: RADIUS.md }}
              />
              <TextInput
                mode="outlined"
                label="Comentario"
                value={comment}
                onChangeText={setComment}
                multiline
                style={{ backgroundColor: COLORS.card }}
                outlineStyle={{ borderRadius: RADIUS.md }}
              />
            </View>
          )}

          <HelperText type="error" visible={!!error}>{error}</HelperText>

          <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
            {canReject && (
              <Button
                mode="outlined"
                textColor={COLORS.danger}
                style={{ flex: 1, borderRadius: RADIUS.md, borderColor: COLORS.danger }}
                onPress={() => submit("REJECTED")}
                loading={saving}
                disabled={saving}
              >
                Rechazar
              </Button>
            )}
            {canApprove && (
              <Button
                mode="contained"
                style={{ flex: 1, borderRadius: RADIUS.md }}
                onPress={() => submit("APPROVED")}
                loading={saving}
                disabled={saving}
              >
                Aprobar
              </Button>
            )}
          </View>
        </Animated.View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
