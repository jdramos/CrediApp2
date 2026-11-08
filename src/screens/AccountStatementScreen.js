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
import PayoffModal from "../components/PayoffModal";
import { money } from "../utils/format";
import { todayISO } from "../utils/date";
import { printReceipt, buildAccountStatementReceiptLines, summarizeMovements, initialBalanceOf } from "../utils/printer";
import { formatReceiptNumber, installmentDetailRows } from "../utils/receipt";
import { COLORS } from "../theme/colors";
import CopyableId from "../components/CopyableId";
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
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
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
  const [showPayoff, setShowPayoff] = useState(false);
  const [error, setError] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  // Pagos recibidos que se ven en pantalla (de 5 en 5 con "Ver más"). Al compartir la
  // imagen se arma con TODO el detalle: todas las cuotas y todos los pagos.
  const PAGE = 5;
  const [visiblePayments, setVisiblePayments] = useState(PAGE);
  const [visibleMoves, setVisibleMoves] = useState(10);
  const [capturing, setCapturing] = useState(false);

  // Resumen a partir de las cuotas (no de capital/interés sueltos): lo que
  // el cobrador necesita ver de un vistazo es cuánto está atrasado, cuánto
  // todavía no vence, y desde cuándo empezó el atraso -- no el desglose
  // capital/interés/seguro de cada rubro. Mismo cálculo que usa el ticket
  // impreso (ver utils/printer.js) para que nunca queden desincronizados.
  const summary = useMemo(
    () => summarizeMovements(statement?.movements, !!statement?.is_flat_plan),
    [statement?.movements, statement?.is_flat_plan],
  );

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
        setStatement(res?.header ? { ...res.header, movements: res.movements, payments: res.payments || [] } : null);
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
      setCapturing(true);
      // Deja que se dibuje el detalle completo antes de capturar.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Estado de cuenta");
    } catch (e) {
      setError(e?.message ?? "No se pudo generar la imagen para compartir");
    } finally {
      setCapturing(false);
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
          customerCode: statement.customer_code,
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
  const initialBalance = initialBalanceOf(statement);

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
            {!!statement.customer_code && <Text style={styles.muted}>Código: {statement.customer_code}</Text>}
            <CopyableId label="Cédula: " value={statement.customer_identification} textStyle={styles.muted} />
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
            {initialBalance > 0 && (
              <View style={styles.balanceRow}>
                <Text style={{ color: COLORS.muted }}>Saldo inicial</Text>
                <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(initialBalance)}</Text>
              </View>
            )}
            {statement.total_paid != null && (
              <View style={styles.balanceRow}>
                <Text style={{ color: COLORS.muted }}>Total pagado</Text>
                <Text style={{ color: COLORS.success, fontWeight: "700" }}>{money(statement.total_paid)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={{ color: COLORS.text, fontWeight: "800" }}>Saldo actual</Text>
              <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 18 }}>{money(summary.totalBalance)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={{ color: COLORS.danger, fontSize: 12 }}>De ese saldo, atrasado</Text>
              <Text style={{ color: COLORS.danger, fontWeight: "600", fontSize: 12 }}>{money(summary.overdueBalance)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={{ color: COLORS.muted, fontSize: 12 }}>De ese saldo, vigente</Text>
              <Text style={{ color: COLORS.text, fontSize: 12 }}>{money(summary.currentBalance)}</Text>
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
              {(showDetail || capturing) && (capturing ? statement.movements : statement.movements.slice(0, visibleMoves)).map((m, idx) => (
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
              {showDetail && !capturing && statement.movements.length > visibleMoves && (
                <Button compact mode="text" onPress={() => setVisibleMoves((v) => v + 20)}>
                  {`Ver más (${statement.movements.length - visibleMoves} restantes)`}
                </Button>
              )}
            </View>
          )}

          {Array.isArray(statement.payments) && statement.payments.length > 0 && (
            <View style={styles.card}>
              <Text style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs }}>
                Pagos recibidos ({statement.payments.length})
              </Text>
              {(capturing ? statement.payments : statement.payments.slice(0, visiblePayments)).map((p, idx) => (
                <View key={p.payment_id}>
                  {idx > 0 && <Divider style={{ marginVertical: SPACING.sm }} />}
                  <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                    {p.payment_date} · Recibo {formatReceiptNumber(p.payment_id)}
                  </Text>
                  <View style={styles.balanceRow}>
                    <Text style={{ color: COLORS.text, fontWeight: "800" }}>Pago recibido</Text>
                    <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 16 }}>{money(p.payment_total)}</Text>
                  </View>
                  {installmentDetailRows(p.installments).length > 0 && (
                    <>
                      <Text style={{ color: COLORS.text, fontWeight: "700", marginBottom: 2 }}>Cuotas cubiertas</Text>
                      {installmentDetailRows(p.installments).map((d) => (
                        <View key={d.key} style={{ marginLeft: SPACING.md, paddingVertical: 3 }}>
                          <Text style={{ color: COLORS.text }}>
                            {d.label}: <Text style={{ fontWeight: "700" }}>{money(d.amount)}</Text>
                          </Text>
                          <Text style={{ color: d.late || !d.paid ? COLORS.warning : COLORS.success, fontSize: 12 }}>
                            {d.status}{d.paid ? "" : `, la cuota es de ${money(d.scheduled)}`}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              ))}
              {!capturing && statement.payments.length > visiblePayments && (
                <Button compact mode="text" onPress={() => setVisiblePayments((v) => v + 10)}>
                  {`Ver más (${statement.payments.length - visiblePayments} restantes)`}
                </Button>
              )}
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
          mode="outlined"
          icon="cash-check"
          onPress={() => setShowPayoff(true)}
          style={{ borderRadius: RADIUS.md }}
          contentStyle={{ height: 46 }}
          labelStyle={{ fontWeight: "700" }}
        >
          Saldo para cancelar hoy
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
      <PayoffModal
        loan={
          showPayoff
            ? { loan_id: statement.loan_id ?? loanId, customer_name: statement.customer_name, customer_code: statement.customer_code, credit_code: statement.credit_code }
            : null
        }
        onDismiss={() => setShowPayoff(false)}
      />
    </SafeAreaView>
  );
}
