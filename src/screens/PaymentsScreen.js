import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, FlatList, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Text,
  TextInput,
  Card,
  Button,
  Chip,
  ActivityIndicator,
  HelperText,
  Divider,
  IconButton,
} from "react-native-paper";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { SessionContext } from "../auth/SessionContext";
import { searchCustomers } from "../api/customerApi";
import { getCustomerActiveLoans, getLoanDetail } from "../api/loanApi";
import { getPaymentMethods, simulatePayment, createPayment } from "../api/paymentApi";
import { isNetworkError } from "../api/credimasterClient";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import { useBusinessDayStatus } from "../hooks/useBusinessDayStatus";
import { useTenantLogo } from "../hooks/useTenantLogo";
import BusinessDayBanner from "../components/BusinessDayBanner";
import { confirmAction } from "../utils/confirm";
import { money, toNumber } from "../utils/format";
import { todayISO } from "../utils/date";
import { printReceipt, buildPaymentReceiptLines } from "../utils/printer";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const BREAKDOWN_MAP = [
  ["principal", "Capital"],
  ["interest", "Interés"],
  ["default_interest", "Interés moratorio"],
  ["insurance", "Seguro"],
  ["fee", "Cargos"],
  ["other", "Otros"],
];

function buildBreakdownRows(applied) {
  if (!applied) return [];
  return BREAKDOWN_MAP
    .filter(([key]) => applied[key] != null && Number(applied[key]) > 0)
    .map(([key, label]) => ({ label, value: applied[key] }));
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  header: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  name: { fontWeight: "700", color: COLORS.text },
  muted: { color: COLORS.muted, marginTop: 2 },
  balance: { color: COLORS.primary, fontWeight: "800", fontSize: 18 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
});

const STEPS = ["Cliente", "Crédito", "Monto", "Listo"];

function StepHeader({ step, onBack, title, right }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm }}>
      {step > 0 && step < 3 && <IconButton icon="arrow-left" onPress={onBack} style={{ margin: 0 }} />}
      <View style={{ flex: 1 }}>
        <Text variant="headlineSmall" style={styles.header}>{title}</Text>
        <Text style={styles.sub}>Paso {step + 1} de {STEPS.length}: {STEPS[step]}</Text>
      </View>
      {right}
    </View>
  );
}

export default function PaymentsScreen({ route }) {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();
  const canView = session?.permissions?.includes("pagos.ver");
  const canCreate = session?.permissions?.includes("pagos.insertar");

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  // Paso 1: cliente
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState(null);

  // Paso 2: crédito
  const [loans, setLoans] = useState([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [loan, setLoan] = useState(null);

  // Paso 3: monto
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [showDate, setShowDate] = useState(false);
  const [methods, setMethods] = useState([]);
  const [methodId, setMethodId] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [sharing, setSharing] = useState(false);
  const receiptShotRef = useRef(null);

  const businessDayStatus = useBusinessDayStatus(session.token, loan?.branch_id);
  const logoUrl = useTenantLogo(session.token);

  // Precarga el monto con la próxima cuota real (next_installment_amount,
  // de LoanController.js::getOne) para que el cobrador no tenga que
  // escribirlo a mano en el caso normal de "vengo a cobrar la cuota" —
  // sigue siendo editable por si el pago es parcial o distinto.
  const defaultAmountFor = (loanData) => {
    const amt = Number(loanData?.next_installment_amount ?? loanData?.installment ?? 0);
    return amt > 0 ? String(amt) : "";
  };

  // Llegó desde "Estado de cuenta" con un cliente/crédito ya elegido —
  // saltamos búsqueda y selección de crédito, directo al monto.
  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (!prefill?.loanId) return;

    setCustomer({
      id: prefill.customerId,
      customer_name: prefill.customerName,
      identification: prefill.customerIdentification,
    });
    setError("");

    (async () => {
      try {
        setLoadingLoans(true);
        const res = await getLoanDetail(session.token, prefill.loanId);
        const loanData = res?.data || res;
        setLoan(loanData);
        setAmount(defaultAmountFor(loanData));
        setStep(2);

        // Este flujo salta directo al paso 2 sin pasar por pickCustomer, que
        // es quien normalmente llena `loans` -- sin esto, si el cobrador
        // presiona "atrás" para volver al paso 1, lo encuentra vacío y ve
        // "este cliente no tiene créditos activos" aunque sí los tenga.
        const [methodsRes, loansRes] = await Promise.all([
          getPaymentMethods(session.token),
          prefill.customerId
            ? getCustomerActiveLoans(session.token, prefill.customerId).catch(() => null)
            : Promise.resolve(null),
        ]);
        const list = methodsRes?.data || [];
        setMethods(list);
        if (list[0]) setMethodId(list[0].id);
        if (loansRes) setLoans(loansRes?.loans || []);
      } catch (e) {
        setError(e?.message ?? "Error cargando el crédito");
      } finally {
        setLoadingLoans(false);
      }
    })();
  }, [route?.params?.prefill, session.token]);

  const reset = () => {
    setStep(0);
    setError("");
    setQuery("");
    setResults([]);
    setCustomer(null);
    setLoans([]);
    setLoan(null);
    setAmount("");
    setDate(todayISO());
    setMethods([]);
    setMethodId(null);
    setBreakdown(null);
    setResult(null);
  };

  const onSearchChange = async (text) => {
    setQuery(text);
    setError("");
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      setSearching(true);
      const res = await searchCustomers(session.token, text.trim());
      setResults(res?.data || []);
    } catch (e) {
      setError(e?.message ?? "Error buscando clientes");
    } finally {
      setSearching(false);
    }
  };

  const pickCustomer = async (c) => {
    setCustomer(c);
    setError("");
    setStep(1);
    try {
      setLoadingLoans(true);
      const res = await getCustomerActiveLoans(session.token, c.id);
      setLoans(res?.loans || []);
    } catch (e) {
      setError(e?.message ?? "Error cargando créditos del cliente");
    } finally {
      setLoadingLoans(false);
    }
  };

  const pickLoan = async (l) => {
    setLoan(l);
    setError("");
    setStep(2);
    try {
      // getCustomerActiveLoans (active-summary) no trae next_installment_amount
      // -- se busca el detalle completo del crédito para precargar el monto,
      // igual que en el flujo por prefill.
      const [methodsRes, detailRes] = await Promise.all([
        getPaymentMethods(session.token),
        getLoanDetail(session.token, l.id || l.loan_id),
      ]);
      const list = methodsRes?.data || [];
      setMethods(list);
      if (list[0]) setMethodId(list[0].id);

      const loanData = detailRes?.data || detailRes;
      if (loanData) {
        setLoan(loanData);
        setAmount(defaultAmountFor(loanData));
      }
    } catch (e) {
      setError(e?.message ?? "Error cargando formas de pago");
    }
  };

  const onSimulate = async () => {
    setError("");
    const amt = toNumber(amount);
    if (!amt || amt <= 0) {
      setError("Ingrese un monto válido");
      return;
    }
    try {
      setSimulating(true);
      const res = await simulatePayment(session.token, {
        loan_id: loan.id || loan.loan_id,
        payment_date: date,
        payment_amount: amt,
      });
      setBreakdown(res?.data || res);
    } catch (e) {
      setError(e?.message ?? "No se pudo calcular el desglose");
    } finally {
      setSimulating(false);
    }
  };

  const submitPayment = async () => {
    setError("");
    const amt = toNumber(amount);
    const payload = {
      loan_id: loan.id || loan.loan_id,
      branch_id: loan.branch_id,
      payment_date: date,
      payment_amount: amt,
      payment_method_id: methodId,
    };
    try {
      setSaving(true);
      const res = await createPayment(session.token, payload);
      setResult(res?.data || res);
      setStep(3);
    } catch (e) {
      if (isNetworkError(e)) {
        confirmAction(
          "Sin conexión",
          "No se pudo conectar al servidor. ¿Guardar este pago para enviarlo automáticamente cuando vuelva la señal?",
          async () => {
            const clientReferenceId = `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            await enqueue({
              type: "PAYMENT",
              label: `Pago ${money(amt)} — crédito #${loan?.id || loan?.loan_id}`,
              payload: { ...payload, client_reference_id: clientReferenceId },
            });
            refreshPendingCount();
            setResult({ pendingOffline: true });
            setStep(3);
          },
          { confirmText: "Guardar" },
        );
        return;
      }
      setError(e?.message ?? "No se pudo registrar el pago");
    } finally {
      setSaving(false);
    }
  };

  const onShareReceipt = async () => {
    try {
      setSharing(true);
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setError("Este dispositivo no permite compartir archivos.");
        return;
      }
      const uri = await captureRef(receiptShotRef, { format: "png", quality: 0.95 });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Comprobante de pago" });
    } catch (e) {
      setError(e?.message ?? "No se pudo generar el comprobante para compartir");
    } finally {
      setSharing(false);
    }
  };

  const onPrintReceipt = () => {
    printReceipt(
      buildPaymentReceiptLines({
        tenantName: session?.tenant?.commercial_name || session?.tenant?.legal_name,
        customerName: customer?.customer_name,
        customerIdentification: customer?.identification,
        loanLabel: loan?.credit_code || loan?.id || loan?.loan_id,
        date,
        collectorName: session?.user?.full_name || session?.user?.user_name,
        amount: toNumber(amount),
        breakdownRows: receiptRows,
        principalBalanceBefore: result?.principal_balance_before,
        principalBalanceAfter: result?.principal_balance_after,
        newBalance: result?.loan?.current_balance,
      }),
    );
  };

  const onConfirm = () => {
    setError("");
    const amt = toNumber(amount);
    if (!amt || amt <= 0) {
      setError("Ingrese un monto válido");
      return;
    }
    if (!methodId) {
      setError("Seleccione una forma de pago");
      return;
    }
    const methodName = methods.find((m) => m.id === methodId)?.name || "";
    confirmAction(
      "Confirmar pago",
      `¿Registrar un pago de ${money(amt)} al crédito #${loan?.id || loan?.loan_id}${methodName ? ` por ${methodName}` : ""}?`,
      submitPayment,
    );
  };

  const breakdownRows = useMemo(() => buildBreakdownRows(breakdown?.applied || breakdown), [breakdown]);
  const receiptRows = useMemo(() => buildBreakdownRows(result?.applied), [result]);

  if (!canView && !canCreate) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: "center", justifyContent: "center", padding: SPACING.xl }]}>
        <MaterialCommunityIcons name="lock-outline" size={48} color={COLORS.muted} />
        <Text style={{ marginTop: SPACING.md, color: COLORS.muted, textAlign: "center" }}>
          No tenés permiso para registrar pagos.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <StepHeader
              step={0}
              title="Registrar pago"
              right={
                canView && (
                  <View style={{ flexDirection: "row" }}>
                    <IconButton
                      icon="account-group-outline"
                      onPress={() => navigation.navigate("ClientPortfolio")}
                    />
                    <IconButton
                      icon="history"
                      onPress={() => navigation.navigate("PaymentHistory")}
                    />
                  </View>
                )
              }
            />
            <TextInput
              mode="outlined"
              label="Buscar cliente (nombre o cédula)"
              value={query}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              style={{ backgroundColor: COLORS.card }}
              outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
              left={<TextInput.Icon icon="magnify" />}
            />
            <HelperText type="error" visible={!!error}>{error}</HelperText>
            {searching && <ActivityIndicator style={{ marginTop: SPACING.md }} />}
            <FlatList
              data={results}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Card style={styles.row} onPress={() => pickCustomer(item)}>
                  <Text style={styles.name}>{item.customer_name}</Text>
                  <Text style={styles.muted}>Cédula: {item.identification}</Text>
                </Card>
              )}
            />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View entering={FadeInDown} exiting={FadeOut}>
            <StepHeader step={1} title={customer?.customer_name || "Créditos"} onBack={() => setStep(0)} />
            <HelperText type="error" visible={!!error}>{error}</HelperText>
            {loadingLoans && <ActivityIndicator style={{ marginTop: SPACING.md }} />}
            {!loadingLoans && loans.length === 0 && !error && (
              <Text style={{ color: COLORS.muted, marginTop: SPACING.md }}>
                Este cliente no tiene créditos activos con saldo.
              </Text>
            )}
            <FlatList
              data={loans}
              keyExtractor={(item) => String(item.id || item.loan_id)}
              scrollEnabled={false}
              renderItem={({ item }) => {
                const daysOverdue = Number(item.days_overdue || 0);
                const inArrears = daysOverdue > 0;
                return (
                <Card style={styles.row} onPress={() => pickLoan(item)}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View>
                      <Text style={styles.name}>Crédito #{item.credit_code || item.id || item.loan_id}</Text>
                      {!!item.branch_name && <Text style={styles.muted}>{item.branch_name}</Text>}
                    </View>
                    {inArrears && (
                      <Chip
                        compact
                        style={{ backgroundColor: COLORS.dangerSoft }}
                        textStyle={{ color: COLORS.danger, fontWeight: "700" }}
                      >
                        Mora {daysOverdue}d
                      </Chip>
                    )}
                  </View>
                  <Text style={styles.balance}>{money(item.current_balance)}</Text>
                  <Text style={styles.muted}>Saldo pendiente</Text>
                  {inArrears && (
                    <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: SPACING.xs }}>
                      {item.overdue_installments} cuota{item.overdue_installments === 1 ? "" : "s"} vencida
                      {item.overdue_installments === 1 ? "" : "s"}
                      {item.oldest_overdue_date ? `, la más antigua desde ${String(item.oldest_overdue_date).slice(0, 10)} (${daysOverdue}d)` : ""}
                      {" — "}{money(item.overdue_amount)}
                    </Text>
                  )}
                  {item.next_installment_amount != null && (
                    <Text style={[styles.muted, { marginTop: SPACING.xs }]}>
                      Próxima cuota a vencer: {money(item.next_installment_amount)}
                      {item.next_payment_date ? ` — vence ${String(item.next_payment_date).slice(0, 10)}` : ""}
                    </Text>
                  )}
                </Card>
                );
              }}
            />
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View entering={FadeInDown} exiting={FadeOut}>
            <StepHeader step={2} title="Monto a pagar" onBack={() => setStep(1)} />
            <BusinessDayBanner status={businessDayStatus} />

            <View style={styles.card}>
              <Text style={styles.muted}>Crédito #{loan?.id || loan?.loan_id}</Text>
              <Text style={styles.balance}>{money(loan?.current_balance)}</Text>
              <Text style={styles.muted}>Saldo pendiente</Text>
            </View>

            <TextInput
              mode="outlined"
              label="Monto"
              value={amount}
              onChangeText={(t) => { setAmount(t); setBreakdown(null); }}
              keyboardType="decimal-pad"
              style={{ backgroundColor: COLORS.card, marginTop: SPACING.md }}
              outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
              left={<TextInput.Icon icon="cash" />}
            />

            <Button
              mode="outlined"
              onPress={() => setShowDate(true)}
              style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
              icon="calendar"
            >
              {date}
            </Button>
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

            <Text style={{ marginTop: SPACING.md, fontWeight: "700", color: COLORS.text }}>Forma de pago</Text>
            <View style={styles.chipsRow}>
              {methods.map((m) => (
                <Chip
                  key={m.id}
                  selected={methodId === m.id}
                  onPress={() => setMethodId(m.id)}
                  style={{ backgroundColor: methodId === m.id ? COLORS.primarySoft : COLORS.card }}
                >
                  {m.name || m.description}
                </Chip>
              ))}
            </View>

            <HelperText type="error" visible={!!error}>{error}</HelperText>

            <Button
              mode="outlined"
              onPress={onSimulate}
              loading={simulating}
              disabled={simulating}
              style={{ marginTop: SPACING.md, borderRadius: RADIUS.md }}
            >
              Ver desglose
            </Button>

            {breakdownRows.length > 0 && (
              <Animated.View entering={FadeInDown} style={[styles.card, { marginTop: SPACING.md }]}>
                <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>
                  Cómo se aplica el pago
                </Text>
                {breakdownRows.map((r) => (
                  <View key={r.label} style={styles.breakdownRow}>
                    <Text style={{ color: COLORS.muted }}>{r.label}</Text>
                    <Text style={{ fontWeight: "600", color: COLORS.text }}>{money(r.value)}</Text>
                  </View>
                ))}
              </Animated.View>
            )}

            {canCreate && (
              <Button
                mode="contained"
                onPress={onConfirm}
                loading={saving}
                disabled={saving}
                style={{ marginTop: SPACING.lg, borderRadius: RADIUS.md }}
                contentStyle={{ height: 46 }}
                labelStyle={{ fontWeight: "700" }}
              >
                Confirmar pago
              </Button>
            )}
          </Animated.View>
        )}

        {step === 3 && (
          <Animated.View entering={FadeIn} style={{ gap: SPACING.md }}>
            <View style={{ alignItems: "center", gap: SPACING.sm, paddingTop: SPACING.md }}>
              <MaterialCommunityIcons
                name={result?.pendingOffline ? "cloud-upload-outline" : "check-decagram"}
                size={56}
                color={result?.pendingOffline ? COLORS.warning : COLORS.success}
              />
              <Text variant="headlineSmall" style={{ fontWeight: "800", color: COLORS.text }}>
                {result?.pendingOffline ? "Pago guardado sin conexión" : "Pago registrado"}
              </Text>
              {result?.pendingOffline && (
                <Chip
                  icon="cloud-sync-outline"
                  style={{ backgroundColor: COLORS.warningSoft }}
                  textStyle={{ fontWeight: "700" }}
                >
                  Se enviará solo cuando vuelva la señal
                </Chip>
              )}
            </View>

            <ViewShot ref={receiptShotRef} options={{ format: "png", quality: 0.95 }} style={{ gap: SPACING.md, backgroundColor: COLORS.bg }}>
              <View style={styles.card}>
                {!!logoUrl && (
                  <Image source={{ uri: logoUrl }} style={{ width: 120, height: 40, alignSelf: "flex-start", marginBottom: SPACING.xs }} resizeMode="contain" />
                )}
                <Text style={{ fontWeight: "800", color: COLORS.primary, fontSize: 12, letterSpacing: 1 }}>
                  {logoUrl ? "" : `${(session?.tenant?.commercial_name || session?.tenant?.legal_name || "CrediMaster").toUpperCase()} — `}
                  {result?.pendingOffline ? "COMPROBANTE (PENDIENTE DE SINCRONIZAR)" : "COMPROBANTE DE PAGO"}
                </Text>
                <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text, marginTop: 2 }}>
                  {customer?.customer_name}
                </Text>
                {!!customer?.identification && (
                  <Text style={styles.muted}>Cédula: {customer.identification}</Text>
                )}
                <Text style={styles.muted}>Crédito #{loan?.credit_code || loan?.id || loan?.loan_id}</Text>
                <Text style={styles.muted}>Fecha: {date}</Text>
                <Text style={styles.muted}>Cobrado por: {session?.user?.full_name || session?.user?.user_name}</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.breakdownRow}>
                  <Text style={{ color: COLORS.text, fontWeight: "800" }}>Monto pagado</Text>
                  <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 18 }}>
                    {money(toNumber(amount))}
                  </Text>
                </View>
                {receiptRows.length > 0 && (
                  <>
                    <Divider style={{ marginVertical: SPACING.xs }} />
                    {receiptRows.map((r) => (
                      <View key={r.label} style={styles.breakdownRow}>
                        <Text style={{ color: COLORS.muted }}>{r.label}</Text>
                        <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(r.value)}</Text>
                      </View>
                    ))}
                  </>
                )}
                {result?.principal_balance_before != null && (
                  <>
                    <Divider style={{ marginVertical: SPACING.xs }} />
                    <View style={styles.breakdownRow}>
                      <Text style={{ color: COLORS.muted }}>Saldo capital anterior</Text>
                      <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(result.principal_balance_before)}</Text>
                    </View>
                    <View style={styles.breakdownRow}>
                      <Text style={{ color: COLORS.muted }}>Saldo capital nuevo</Text>
                      <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(result.principal_balance_after)}</Text>
                    </View>
                  </>
                )}
                {result?.loan?.current_balance != null && (
                  <>
                    <Divider style={{ marginVertical: SPACING.xs }} />
                    <View style={styles.breakdownRow}>
                      <Text style={{ color: COLORS.muted }}>Nuevo saldo total</Text>
                      <Text style={{ color: COLORS.text, fontWeight: "700" }}>{money(result.loan.current_balance)}</Text>
                    </View>
                  </>
                )}
              </View>
            </ViewShot>

            <HelperText type="error" visible={!!error}>{error}</HelperText>

            <Button
              mode="outlined"
              icon="share-variant"
              onPress={onShareReceipt}
              loading={sharing}
              disabled={sharing}
              style={{ borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
            >
              Compartir comprobante (WhatsApp, correo, etc.)
            </Button>

            <Button
              mode="outlined"
              icon="printer-outline"
              onPress={onPrintReceipt}
              style={{ borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
            >
              Imprimir (impresora Bluetooth)
            </Button>

            <Button mode="contained" onPress={reset} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
              Registrar otro pago
            </Button>
          </Animated.View>
        )}

        <Divider style={{ marginTop: SPACING.lg, opacity: 0 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
