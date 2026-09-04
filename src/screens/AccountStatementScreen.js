import React, { useContext, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, Chip, IconButton, Divider } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { SessionContext } from "../auth/SessionContext";
import { getAccountStatement } from "../api/loanApi";
import { money } from "../utils/format";
import { todayISO } from "../utils/date";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const STATUS_COLOR = {
  Pagada: COLORS.success,
  Parcial: COLORS.warning,
  Atrasado: COLORS.danger,
  Vigente: COLORS.muted,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  shot: { backgroundColor: COLORS.bg, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  brand: { fontWeight: "800", color: COLORS.primary, fontSize: 12, letterSpacing: 1 },
  name: { fontWeight: "800", color: COLORS.text, marginTop: 2 },
  muted: { color: COLORS.muted, marginTop: 2 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: SPACING.sm, marginTop: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.border },
  moveRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
});

export default function AccountStatementScreen({ route }) {
  const { loanId } = route.params;
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const shotRef = useRef(null);

  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await getAccountStatement(session.token, loanId);
        // El backend devuelve { ok, header, movements } (no { data }) --
        // se aplanan en un solo objeto porque toda la pantalla lee los
        // campos de "header" (customer_name, capital_balance, etc.) al
        // nivel raíz de `statement`.
        setStatement(res?.header ? { ...res.header, movements: res.movements } : null);
      } catch (e) {
        setError(e?.message ?? "Error cargando el estado de cuenta");
      } finally {
        setLoading(false);
      }
    })();
  }, [loanId, session.token]);

  const onShare = async () => {
    try {
      setSharing(true);
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setError("Este dispositivo no permite compartir archivos.");
        return;
      }
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Estado de cuenta" });
    } catch (e) {
      setError(e?.message ?? "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const goToPayment = () => {
    navigation.getParent()?.navigate("Pagos", {
      screen: "PaymentsHome",
      params: {
        prefill: {
          customerId: statement.customer_id,
          customerName: statement.customer_name,
          customerIdentification: statement.customer_identification,
          loanId: statement.loan_id ?? loanId,
        },
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!statement) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center", padding: SPACING.xl }]}>
        <HelperText type="error" visible>{error || "No se pudo cargar el estado de cuenta"}</HelperText>
      </SafeAreaView>
    );
  }

  const inArrears = Number(statement.defaulted_days || 0) > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="titleLarge" style={styles.title}>Estado de cuenta</Text>
        <IconButton icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={styles.shot}>
          <View style={styles.card}>
            <Text style={styles.brand}>CREDIMASTER</Text>
            <Text variant="titleLarge" style={styles.name}>{statement.customer_name}</Text>
            <Text style={styles.muted}>Cédula: {statement.customer_identification}</Text>
            <Text style={styles.muted}>Crédito #{statement.credit_code || statement.loan_id}</Text>
            <Text style={styles.muted}>Corte al {todayISO()}</Text>
            {inArrears && (
              <Chip
                icon="alert-circle-outline"
                style={{ marginTop: SPACING.sm, alignSelf: "flex-start", backgroundColor: COLORS.dangerSoft }}
                textStyle={{ color: COLORS.danger, fontWeight: "700" }}
              >
                En mora: {statement.defaulted_days} días
              </Chip>
            )}
          </View>

          <View style={styles.card}>
            <Text style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs }}>Saldo pendiente</Text>
            <View style={styles.balanceRow}>
              <Text style={{ color: COLORS.muted }}>Capital</Text>
              <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(statement.capital_balance)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={{ color: COLORS.muted }}>Interés</Text>
              <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(statement.interest_balance)}</Text>
            </View>
            {Number(statement.insurance_balance || 0) > 0 && (
              <View style={styles.balanceRow}>
                <Text style={{ color: COLORS.muted }}>Seguro</Text>
                <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(statement.insurance_balance)}</Text>
              </View>
            )}
            {Number(statement.fee_balance || 0) > 0 && (
              <View style={styles.balanceRow}>
                <Text style={{ color: COLORS.muted }}>Comisión</Text>
                <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(statement.fee_balance)}</Text>
              </View>
            )}
            {Number(statement.other_charges_balance || 0) > 0 && (
              <View style={styles.balanceRow}>
                <Text style={{ color: COLORS.muted }}>Otros cargos</Text>
                <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(statement.other_charges_balance)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={{ color: COLORS.text, fontWeight: "800" }}>Total adeudado</Text>
              <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 18 }}>{money(statement.total_balance)}</Text>
            </View>
          </View>

          {Array.isArray(statement.movements) && statement.movements.length > 0 && (
            <View style={styles.card}>
              <Text style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs }}>Detalle de cuotas</Text>
              {statement.movements.map((m, idx) => (
                <View key={m.payment_number ?? idx}>
                  {idx > 0 && <Divider />}
                  <View style={styles.moveRow}>
                    <View>
                      <Text style={{ color: COLORS.text, fontWeight: "600" }}>Cuota #{m.payment_number}</Text>
                      <Text style={{ color: COLORS.muted, fontSize: 12 }}>{m.payment_date}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(m.installment_total)}</Text>
                      <Text style={{ color: STATUS_COLOR[m.status_label] || COLORS.muted, fontSize: 12 }}>
                        {m.status_label || m.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ViewShot>

        <HelperText type="error" visible={!!error}>{error}</HelperText>

        <Button
          mode="contained"
          icon="cash-fast"
          onPress={goToPayment}
          style={{ borderRadius: RADIUS.md }}
          contentStyle={{ height: 46 }}
          labelStyle={{ fontWeight: "700" }}
        >
          Registrar pago
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
