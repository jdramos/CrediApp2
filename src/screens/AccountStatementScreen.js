import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, Chip, IconButton, Divider } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import ViewShot, { captureRef } from "react-native-view-shot";
import { shareImage } from "../utils/shareImage";
import { SessionContext } from "../auth/SessionContext";
import { getAccountStatement } from "../api/loanApi";
import { useTenantLogo } from "../hooks/useTenantLogo";
import AddressLines from "../components/AddressLines";
import { money } from "../utils/format";
import { todayISO } from "../utils/date";
import { printReceipt, buildAccountStatementReceiptLines, summarizeMovements } from "../utils/printer";
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
  logo: { width: 120, height: 40, alignSelf: "flex-start" },
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
  const logoUrl = useTenantLogo(session?.token);

  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [showDetail, setShowDetail] = useState(false);

  // Resumen a partir de las cuotas (no de capital/interés sueltos): lo que
  // el cobrador necesita ver de un vistazo es cuánto está atrasado, cuánto
  // todavía no vence, y desde cuándo empezó el atraso -- no el desglose
  // capital/interés/seguro de cada rubro. Mismo cálculo que usa el ticket
  // impreso (ver utils/printer.js) para que nunca queden desincronizados.
  const summary = useMemo(() => summarizeMovements(statement?.movements), [statement?.movements]);

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
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Estado de cuenta");
    } catch (e) {
      setError(e?.message ?? "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const onPrint = () => {
    printReceipt(
      buildAccountStatementReceiptLines(
        statement,
        session?.tenant?.commercial_name || session?.tenant?.legal_name,
      ),
    );
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
        <IconButton icon="history" onPress={() => navigation.navigate("LoanActions", { loanId })} />
        <IconButton icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={styles.shot}>
          <View style={styles.card}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" />
            ) : (
              <Text style={styles.brand}>
                {(session?.tenant?.commercial_name || session?.tenant?.legal_name || "CrediMaster").toUpperCase()}
              </Text>
            )}
            <Text variant="titleLarge" style={styles.name}>{statement.customer_name}</Text>
            <Text style={styles.muted}>Cédula: {statement.customer_identification}</Text>
            <AddressLines
              customer={{
                home_address: statement.customer_home_address,
                business_address: statement.customer_business_address,
              }}
              showMissing={false}
            />
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
            <Text style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs }}>Resumen de saldo</Text>
            <View style={styles.balanceRow}>
              <Text style={{ color: COLORS.danger, fontWeight: "600" }}>Saldo atrasado</Text>
              <Text style={{ color: COLORS.danger, fontWeight: "700" }}>{money(summary.overdueBalance)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={{ color: COLORS.muted }}>Saldo vigente</Text>
              <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(summary.currentBalance)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={{ color: COLORS.text, fontWeight: "800" }}>Total adeudado</Text>
              <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 18 }}>{money(summary.totalBalance)}</Text>
            </View>
            {!!summary.overdueSinceDate && (
              <Text style={{ color: COLORS.danger, marginTop: SPACING.sm, fontSize: 12 }}>
                En mora desde el {String(summary.overdueSinceDate).slice(0, 10)}
              </Text>
            )}
          </View>

          {Array.isArray(statement.movements) && statement.movements.length > 0 && (
            <View style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "800", color: COLORS.text }}>Detalle de cuotas</Text>
                <Button compact mode="text" onPress={() => setShowDetail((v) => !v)}>
                  {showDetail ? "Ocultar" : "Ver detalle"}
                </Button>
              </View>
              {showDetail && statement.movements.map((m, idx) => (
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
          mode="outlined"
          icon="share-variant"
          onPress={onShare}
          loading={sharing}
          disabled={sharing}
          style={{ borderRadius: RADIUS.md }}
          contentStyle={{ height: 46 }}
          labelStyle={{ fontWeight: "700" }}
        >
          Compartir (WhatsApp, correo, etc.)
        </Button>

        <Button
          mode="outlined"
          icon="printer-outline"
          onPress={onPrint}
          style={{ borderRadius: RADIUS.md }}
          contentStyle={{ height: 46 }}
          labelStyle={{ fontWeight: "700" }}
        >
          Imprimir (impresora Bluetooth)
        </Button>

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
