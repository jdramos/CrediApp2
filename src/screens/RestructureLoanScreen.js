import React, { useContext, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, ActivityIndicator, HelperText, IconButton } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import CatalogPickerField from "../components/CatalogPickerField";
import { DateWheelField, todayISODate } from "../components/DateWheelPicker";
import { SessionContext } from "../auth/SessionContext";
import { getFrecuencies } from "../api/frecuencyApi";
import { simulateLoan } from "../api/loanApi";
import { getRestructureQuote, requestLoanRestructure } from "../api/loanRestructureApi";
import { isNetworkError } from "../api/credimasterClient";
import { isConnected } from "../offline/network";
import { summarizeSchedule } from "../utils/loanSimulation";
import { suggestFirstPayment } from "../utils/restructure";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Solicitar la reestructuración de un crédito como CRÉDITO NUEVO (dueño, 2026-11-12; empresas no normadas).
// El monto nuevo es el saldo total para cancelar hoy el crédito anterior. La solicitud entra a la bandeja de aprobación y,
// al desembolsarla, el sistema cancela el crédito anterior con ese monto. Queda una nota que dice que es reestructuración.
// Necesita conexión: el saldo lo calcula el servidor al momento.

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  group: { fontWeight: "800", color: COLORS.muted, fontSize: 12, textTransform: "uppercase" },
  input: { backgroundColor: COLORS.card },
  hint: { color: COLORS.muted, fontSize: 13 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm },
  muted: { color: COLORS.muted },
  strong: { color: COLORS.text, fontWeight: "700" },
  bigAmount: { color: COLORS.primary, fontWeight: "800", fontSize: 28 },
});

const num = (text) => Number(String(text ?? "").replace(",", ".").trim());
const trimNumber = (v) => String(Math.round(Number(v || 0) * 10000) / 10000);

export default function RestructureLoanScreen({ route }) {
  const { loanId, customerName, creditCode } = route.params || {};
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const canSimulate = session?.permissions?.includes("creditos.amortizacion.ver");

  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [frecuencies, setFrecuencies] = useState([]);
  const [term, setTerm] = useState("");
  const [rate, setRate] = useState("");
  const [frequencyId, setFrequencyId] = useState(null);
  const [firstDate, setFirstDate] = useState("");
  const [firstAuto, setFirstAuto] = useState(true);
  const [note, setNote] = useState("");
  const [sim, setSim] = useState(null); // { loading, summary, error }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Misma referencia en cada reintento: si la primera respuesta se perdió, el servidor no crea dos solicitudes.
  const clientRef = useRef(`restructure-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!(await isConnected().catch(() => true))) {
          throw Object.assign(new TypeError("Sin conexión"), { offline: true });
        }
        const [res, freqs] = await Promise.all([
          getRestructureQuote(session.token, loanId),
          getFrecuencies(session.token).catch(() => []),
        ]);
        if (!alive) return;
        const data = res?.data;
        setQuote(data);
        setFrecuencies(freqs || []);
        if (data?.loan) {
          setRate(trimNumber(data.loan.interest_rate));
          setTerm(trimNumber(data.loan.term));
          const current = (freqs || []).find((f) => f.tag === data.loan.frequency);
          if (current) setFrequencyId(current.id);
        }
      } catch (e) {
        if (alive) {
          setLoadError(
            e?.offline || isNetworkError(e)
              ? "Sin conexión: la reestructuración necesita señal para calcular el saldo total. Intente de nuevo cuando tenga internet."
              : e?.message ?? "No se pudo preparar la reestructuración",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loanId, session.token]);

  const selectedFrequency = frecuencies.find((f) => String(f.id) === String(frequencyId));
  const tag = selectedFrequency?.tag;
  const isSingleDue = tag === "V";
  const newAmount = Number(quote?.new_amount) || 0;
  const branchId = quote?.loan?.branch_id;

  // La primera cuota sugerida sigue a la frecuencia mientras no se cambie a mano.
  useEffect(() => {
    if (firstAuto && tag) setFirstDate(suggestFirstPayment(tag));
  }, [firstAuto, tag]);

  // Cuota estimada con la misma tabla de amortización del simulador (ayuda; no cambia lo que se envía).
  useEffect(() => {
    if (!canSimulate || !(newAmount > 0) || !branchId || !tag) return undefined;
    const months = num(term);
    const interest = num(rate);
    if (!(months > 0) || !(interest > 0)) {
      setSim(null);
      return undefined;
    }
    let alive = true;
    setSim((s) => ({ loading: true, summary: s?.summary || null }));
    const timer = setTimeout(() => {
      simulateLoan(session.token, {
        amount: newAmount,
        interest_rate: interest,
        term: months,
        requestDate: todayISODate(),
        frequency_id: tag,
        branch_id: branchId,
        ...(!firstAuto && firstDate && tag !== "V" ? { first_payment_date: firstDate } : {}),
      })
        .then((table) => alive && setSim({ loading: false, summary: summarizeSchedule(table) }))
        .catch(() => alive && setSim({ loading: false, summary: null, error: true }));
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [canSimulate, newAmount, branchId, tag, term, rate, firstAuto, firstDate, session.token]);

  const validate = () => {
    if (!(num(term) > 0)) return "Escriba el nuevo plazo en meses (por ejemplo 6 o 1.5).";
    if (String(rate).trim() === "" || !(num(rate) >= 0)) return "Escriba la nueva tasa.";
    if (frecuencies.length > 0 && !selectedFrequency) return "Elija la frecuencia de pago.";
    if (!isSingleDue && !firstDate) return "Elija la fecha de la primera cuota.";
    if (!note.trim()) return "Escriba la nota o el motivo de la reestructuración.";
    return "";
  };

  const send = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await requestLoanRestructure(session.token, loanId, {
        note: note.trim(),
        term: num(term),
        interest_rate: num(rate),
        frequency_id: tag || quote?.loan?.frequency || null,
        first_payment_date: !firstAuto && firstDate && !isSingleDue ? firstDate : null,
        source: "MOBILE",
        client_reference_id: clientRef.current,
      });
      const code = res?.loan_id ? ` Crédito nuevo #${res.loan_id}.` : "";
      Alert.alert(
        "Solicitud enviada",
        `La reestructuración quedó pendiente de aprobación.${code} Cuando la aprueben y la desembolsen, el crédito anterior se cancela con el saldo total.`,
        [{ text: "Listo", onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      setError(e?.message ?? "No se pudo enviar la solicitud");
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async () => {
    const problem = validate();
    if (problem) return setError(problem);
    setError("");
    if (!(await isConnected().catch(() => true))) {
      return setError("Sin conexión: la reestructuración necesita señal. Intente de nuevo cuando tenga internet.");
    }
    Alert.alert(
      "Enviar solicitud",
      `Se creará un crédito nuevo por ${money(newAmount)} (el saldo total de hoy) que reemplaza al crédito ${quote?.loan?.credit_code || loanId}. Queda pendiente hasta que lo aprueben.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar", onPress: send },
      ],
    );
  };

  const header = (
    <View style={styles.headerRow}>
      <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
      <Text variant="headlineSmall" style={styles.title}>Reestructurar crédito</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {header}
        <ActivityIndicator style={{ marginTop: SPACING.xl }} />
      </SafeAreaView>
    );
  }

  if (loadError || !quote) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {header}
        <Text style={[styles.hint, { padding: SPACING.lg }]}>{loadError || "No se pudo preparar la reestructuración."}</Text>
      </SafeAreaView>
    );
  }

  const loan = quote.loan || {};
  const blocked = !quote.can_restructure;
  const s = sim?.summary;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {header}
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={{ fontWeight: "800", color: COLORS.text, fontSize: 16 }}>{customerName || loan.customer_name || "Cliente"}</Text>
          <Text style={styles.hint}>Crédito a reestructurar #{creditCode || loan.credit_code || loanId}</Text>
          <View style={styles.row}>
            <Text style={styles.muted}>Monto original</Text>
            <Text style={styles.strong}>{money(loan.amount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>Plazo / tasa / frecuencia</Text>
            <Text style={styles.strong}>{trimNumber(loan.term)} m · {trimNumber(loan.interest_rate)}% · {loan.frecuency_name || loan.frequency}</Text>
          </View>
        </View>

        {blocked ? (
          <View style={[styles.card, { backgroundColor: COLORS.warningSoft }]}>
            <Text style={{ color: COLORS.text }}>{quote.blocking || "Este crédito no se puede reestructurar ahora."}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.group}>Monto del crédito nuevo</Text>
            <Text style={styles.bigAmount}>{money(newAmount)}</Text>
            <Text style={styles.hint}>
              Es el saldo total para cancelar hoy el crédito anterior (capital, interés, mora y cargos). El monto lo fija el sistema.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.group}>Condiciones nuevas</Text>
          <TextInput mode="outlined" dense label="Nuevo plazo (meses)" value={term} onChangeText={setTerm} keyboardType="decimal-pad" style={styles.input} />
          <TextInput mode="outlined" dense label="Nueva tasa mensual (%)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" style={styles.input} />
          {frecuencies.length > 0 && (
            <CatalogPickerField
              label="Frecuencia de pago"
              value={frequencyId}
              options={frecuencies.map((f) => ({ id: f.id, label: f.name }))}
              onChange={setFrequencyId}
            />
          )}
          {!isSingleDue && (
            <DateWheelField
              dense
              label="Primera cuota"
              value={firstDate}
              clearable={false}
              onChange={(iso) => {
                if (!iso) return;
                setFirstAuto(false);
                setFirstDate(iso);
              }}
              minYear={new Date().getFullYear()}
              maxYear={new Date().getFullYear() + 3}
              helperText={firstAuto ? "Sugerida por la frecuencia. Tóquela para cambiarla." : "Fecha pactada con el cliente."}
              style={styles.input}
            />
          )}
          {!firstAuto && !isSingleDue && (
            <Button compact mode="text" onPress={() => setFirstAuto(true)} style={{ alignSelf: "flex-start" }}>
              Usar la fecha sugerida
            </Button>
          )}
        </View>

        {canSimulate && !blocked && (
          <View style={styles.card}>
            <Text style={styles.group}>Cuota estimada</Text>
            {sim?.loading && !s ? (
              <ActivityIndicator style={{ alignSelf: "flex-start" }} />
            ) : s ? (
              <View style={{ opacity: sim.loading ? 0.5 : 1 }}>
                <Text style={styles.bigAmount}>{money(s.installment)}</Text>
                <Text style={styles.muted}>
                  {s.installments} cuota{s.installments === 1 ? "" : "s"}{selectedFrequency?.name ? ` · ${selectedFrequency.name}` : ""}
                </Text>
                <View style={styles.row}>
                  <Text style={styles.muted}>Total a pagar</Text>
                  <Text style={styles.strong}>{money(s.total)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.muted}>Primera cuota</Text>
                  <Text style={styles.strong}>{s.firstDate}</Text>
                </View>
                <Text style={[styles.hint, { fontSize: 11 }]}>Cálculo estimado: la cuota final la define el sistema al aprobar.</Text>
              </View>
            ) : (
              <Text style={styles.muted}>{sim?.error ? "No se pudo calcular la cuota con estos datos." : "Complete plazo, tasa y frecuencia para ver la cuota."}</Text>
            )}
          </View>
        )}

        <TextInput
          mode="outlined"
          label="Nota / motivo de la reestructuración"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          maxLength={380}
          style={styles.input}
        />
        <Text style={styles.hint}>La nota queda en el crédito nuevo, junto con el aviso de que reemplaza al crédito anterior.</Text>

        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <Button mode="contained" icon="send" loading={saving} disabled={saving || blocked} onPress={onSubmit} style={{ borderRadius: RADIUS.md }}>
          Enviar solicitud
        </Button>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
