import React, { useContext, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, ActivityIndicator, HelperText, Checkbox, Chip, IconButton } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import CatalogPickerField from "../components/CatalogPickerField";
import { DateWheelField } from "../components/DateWheelPicker";
import { suggestFirstPayment } from "../utils/restructure";
import { SessionContext } from "../auth/SessionContext";
import { getLoanDetail } from "../api/loanApi";
import { getFrecuencies } from "../api/frecuencyApi";
import { previewLoanModification, requestLoanModification } from "../api/loanModificationApi";
import { isConnected } from "../offline/network";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Solicitar una reestructuración desde la app (dueño, 2026-11-12). La app solo pide: la solicitud queda pendiente y la
// aprueban en la web. Reglas del servidor (api/loan/loanModificationController.js): se reprograma solo el capital
// pendiente, hace falta deterioro de la capacidad de pago, análisis de riesgo, capacidad de pago con las condiciones
// nuevas, ausencia de desviación de fondos y garantía mantenida o mejor posición de recuperación. Necesita señal.

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
  checkRow: { flexDirection: "row", alignItems: "center" },
  checkText: { flex: 1, color: COLORS.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  cuotaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  warnBox: { backgroundColor: COLORS.warningSoft, borderRadius: RADIUS.md, padding: SPACING.sm, gap: 2 },
  okBox: { backgroundColor: COLORS.successSoft, borderRadius: RADIUS.md, padding: SPACING.sm },
});

// Texto de cada casilla; las cuatro primeras las exige el servidor siempre.
const CHECKS = [
  ["payment_capacity_deteriorated", "La capacidad de pago del cliente se deterioró"],
  ["risk_analysis_done", "Se hizo el análisis de riesgo"],
  ["payment_capacity_verified", "Tiene capacidad de pago con las condiciones nuevas"],
  ["no_fund_diversion_verified", "No hubo desviación de fondos"],
];
const COVERAGE_CHECKS = [
  ["guarantee_coverage_maintained", "La cobertura de la garantía se mantiene"],
  ["recovery_position_improved", "Mejora la posición de recuperación"],
];

const num = (text) => Number(String(text ?? "").replace(",", ".").trim());
const rateText = (v) => String(Math.round(Number(v || 0) * 10000) / 10000);

function CheckLine({ label, checked, onToggle, disabled }) {
  return (
    <View style={styles.checkRow}>
      <Checkbox status={checked ? "checked" : "unchecked"} onPress={onToggle} disabled={disabled} />
      <Text style={styles.checkText} onPress={disabled ? undefined : onToggle}>{label}</Text>
    </View>
  );
}

export default function RestructureRequestScreen({ route }) {
  const { loanId, customerName, creditCode } = route.params || {};
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const canRequest = session?.permissions?.includes("creditos.modificaciones.solicitar");

  const [loan, setLoan] = useState(null);
  const [loadingLoan, setLoadingLoan] = useState(true);
  const [frecuencies, setFrecuencies] = useState([]);
  const [term, setTerm] = useState("");
  const [rate, setRate] = useState("");
  const [frequencyId, setFrequencyId] = useState(null);
  const [firstDate, setFirstDate] = useState("");
  const [firstAuto, setFirstAuto] = useState(true);
  const [justification, setJustification] = useState("");
  const [checks, setChecks] = useState({});
  const [revertInterest, setRevertInterest] = useState(false);
  const [revertMora, setRevertMora] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // El detalle del crédito solo sirve para sugerir tasa y frecuencia actuales: sin permiso o sin señal se sigue igual.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [detail, freqs] = await Promise.all([
        getLoanDetail(session.token, loanId).then((r) => r?.data || null).catch(() => null),
        getFrecuencies(session.token).catch(() => []),
      ]);
      if (!alive) return;
      setLoan(detail);
      setFrecuencies(freqs || []);
      if (detail?.interest_rate != null) setRate(rateText(detail.interest_rate));
      const current = (freqs || []).find((f) => f.tag === detail?.frequency);
      if (current) setFrequencyId(current.id);
      setLoadingLoan(false);
    })();
    return () => {
      alive = false;
    };
  }, [loanId, session.token]);

  const selectedFrequency = frecuencies.find((f) => String(f.id) === String(frequencyId));
  const isSingleDue = selectedFrequency?.tag === "V";

  // La primera cuota sugerida sigue a la frecuencia mientras el usuario no la cambie a mano.
  useEffect(() => {
    if (firstAuto && selectedFrequency?.tag) setFirstDate(suggestFirstPayment(selectedFrequency.tag));
  }, [firstAuto, selectedFrequency?.tag]);

  const changed = (setter) => (value) => {
    setPreview(null);
    setter(value);
  };
  const toggleCheck = (key) => setChecks((c) => ({ ...c, [key]: !c[key] }));

  const body = () => ({
    modification_type: "REESTRUCTURACION",
    new_term: num(term),
    new_interest_rate: num(rate),
    new_payment_frequency: selectedFrequency?.tag || loan?.frequency || null,
    first_payment_date: firstDate || null,
    revert_pending_interest: revertInterest,
    revert_pending_mora: revertMora,
  });

  const validateTerms = () => {
    if (!(num(term) > 0)) return "Escriba el nuevo plazo en meses (por ejemplo 6 o 1.5).";
    if (!(num(rate) >= 0) || String(rate).trim() === "") return "Escriba la nueva tasa mensual.";
    if (frecuencies.length > 0 && !selectedFrequency) return "Elija la frecuencia de pago.";
    if (!firstDate) return isSingleDue ? "Elija la fecha de vencimiento." : "Elija la fecha de la primera cuota.";
    return "";
  };

  const withConnection = async () => {
    if (await isConnected().catch(() => true)) return true;
    setError("Sin conexión: la solicitud de reestructuración necesita señal. Intente de nuevo cuando tenga internet.");
    return false;
  };

  const onPreview = async () => {
    const problem = validateTerms();
    if (problem) return setError(problem);
    setError("");
    if (!(await withConnection())) return;
    setPreviewing(true);
    try {
      const res = await previewLoanModification(session.token, loanId, body());
      setPreview(res?.preview || null);
    } catch (e) {
      setPreview(null);
      setError(e?.message ?? "No se pudo calcular la tabla nueva");
    } finally {
      setPreviewing(false);
    }
  };

  const validateRequest = () => {
    const problem = validateTerms();
    if (problem) return problem;
    for (const [key, label] of CHECKS) if (!checks[key]) return `Marque: ${label}.`;
    if (!checks.guarantee_coverage_maintained && !checks.recovery_position_improved) {
      return "Marque que la garantía se mantiene o que mejora la posición de recuperación.";
    }
    if (!justification.trim()) return "Escriba la justificación de la reestructuración.";
    return "";
  };

  const send = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await requestLoanModification(session.token, loanId, {
        ...body(),
        justification: justification.trim(),
        payment_capacity_deteriorated: !!checks.payment_capacity_deteriorated,
        risk_analysis_done: !!checks.risk_analysis_done,
        payment_capacity_verified: !!checks.payment_capacity_verified,
        no_fund_diversion_verified: !!checks.no_fund_diversion_verified,
        guarantee_coverage_maintained: !!checks.guarantee_coverage_maintained,
        recovery_position_improved: !!checks.recovery_position_improved,
      });
      Alert.alert("Solicitud enviada", res?.message || "La solicitud de reestructuración quedó pendiente de aprobación.", [
        { text: "Listo", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      setError(e?.message ?? "No se pudo enviar la solicitud");
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async () => {
    const problem = validateRequest();
    if (problem) return setError(problem);
    setError("");
    if (!(await withConnection())) return;
    Alert.alert(
      "Enviar solicitud",
      "Se enviará la solicitud de reestructuración de este crédito. Queda pendiente hasta que la aprueben en el sistema.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Enviar", onPress: send },
      ],
    );
  };

  const cuotas = preview?.cuotas || [];
  const shownCuotas = useMemo(() => cuotas.slice(0, 8), [cuotas]);

  const header = (
    <View style={styles.headerRow}>
      <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
      <Text variant="headlineSmall" style={styles.title}>Solicitar reestructuración</Text>
    </View>
  );

  if (!canRequest) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {header}
        <Text style={[styles.hint, { padding: SPACING.lg }]}>Su usuario no tiene permiso para solicitar reestructuraciones.</Text>
      </SafeAreaView>
    );
  }

  if (loadingLoan) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {header}
        <ActivityIndicator style={{ marginTop: SPACING.xl }} />
      </SafeAreaView>
    );
  }

  const status = loan?.status;
  const notActive = !!status && status !== "DISBURSED";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {header}
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={{ fontWeight: "800", color: COLORS.text, fontSize: 16 }}>{customerName || loan?.customer_name || "Cliente"}</Text>
          <Text style={styles.hint}>Crédito #{creditCode || loan?.credit_code || loanId}</Text>
          {!!loan && (
            <View style={styles.chips}>
              <Chip compact>Saldo {money(loan.display_balance ?? loan.current_balance)}</Chip>
              {loan.term != null && <Chip compact>Plazo {loan.term} m</Chip>}
              {loan.interest_rate != null && <Chip compact>Tasa {rateText(loan.interest_rate)}%</Chip>}
              {!!loan.frecuency_name && <Chip compact>{loan.frecuency_name}</Chip>}
            </View>
          )}
        </View>

        {notActive && (
          <View style={styles.warnBox}>
            <Text style={{ color: COLORS.text }}>Este crédito no está vigente: solo se pueden reestructurar créditos desembolsados con saldo.</Text>
          </View>
        )}

        <Text style={styles.hint}>
          Se reprograma el capital pendiente con las condiciones nuevas. La solicitud queda pendiente: la aprueban en el sistema y
          solo entonces cambia la tabla de cuotas. Necesita conexión.
        </Text>

        <View style={styles.card}>
          <Text style={styles.group}>Condiciones nuevas</Text>
          <TextInput
            mode="outlined"
            dense
            label="Nuevo plazo (meses)"
            value={term}
            onChangeText={changed(setTerm)}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            dense
            label="Nueva tasa mensual (%)"
            value={rate}
            onChangeText={changed(setRate)}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          {frecuencies.length > 0 && (
            <CatalogPickerField
              label="Frecuencia de pago"
              value={frequencyId}
              options={frecuencies.map((f) => ({ id: f.id, label: f.name }))}
              onChange={(id) => {
                setPreview(null);
                setFrequencyId(id);
              }}
            />
          )}
          <DateWheelField
            dense
            label={isSingleDue ? "Fecha de vencimiento" : "Primera cuota"}
            value={firstDate}
            clearable={false}
            onChange={(iso) => {
              if (!iso) return;
              setPreview(null);
              setFirstAuto(false);
              setFirstDate(iso);
            }}
            minYear={new Date().getFullYear()}
            maxYear={new Date().getFullYear() + 3}
            helperText={firstAuto ? "Sugerida por la frecuencia. Tóquela para cambiarla." : "Fecha pactada con el cliente."}
            style={styles.input}
          />
          {!firstAuto && (
            <Button compact mode="text" onPress={() => { setPreview(null); setFirstAuto(true); }} style={{ alignSelf: "flex-start" }}>
              Usar la fecha sugerida
            </Button>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.group}>Intereses pendientes</Text>
          <CheckLine
            label="Revertir el interés pendiente"
            checked={revertInterest}
            onToggle={() => { setPreview(null); setRevertInterest((v) => !v); }}
          />
          <CheckLine
            label="Revertir también la mora"
            checked={revertMora}
            onToggle={() => { setPreview(null); setRevertMora((v) => !v); }}
          />
          <Text style={styles.hint}>
            Para aplicar la reestructuración, el interés al día y la mora deben estar pagados o revertidos. Si no los revierte aquí,
            habrá que cobrarlos antes de que la aprueben.
          </Text>
        </View>

        <Button mode="outlined" icon="calculator-variant" loading={previewing} disabled={previewing || saving} onPress={onPreview} style={{ borderRadius: RADIUS.md }}>
          Ver tabla nueva
        </Button>

        {!!preview && (
          <View style={styles.card}>
            <Text style={styles.group}>Tabla nueva</Text>
            {preview.blockers?.length > 0 ? (
              <View style={styles.warnBox}>
                <Text style={{ fontWeight: "700", color: COLORS.text }}>Antes de aprobarla hay que cobrar o revertir:</Text>
                {preview.blockers.map((b) => (
                  <Text key={b} style={{ color: COLORS.text }}>• {b}</Text>
                ))}
              </View>
            ) : (
              <View style={styles.okBox}>
                <Text style={{ color: COLORS.text }}>
                  {Number(preview.interest_to_revert) > 0 || Number(preview.mora_to_revert) > 0
                    ? `Se puede aplicar: al aprobarse se revierten${Number(preview.interest_to_revert) > 0 ? ` ${money(preview.interest_to_revert)} de interés` : ""}${Number(preview.interest_to_revert) > 0 && Number(preview.mora_to_revert) > 0 ? " y" : ""}${Number(preview.mora_to_revert) > 0 ? ` ${money(preview.mora_to_revert)} de mora` : ""} (montos de hoy).`
                    : "El interés y la mora están al día: se puede aplicar."}
                </Text>
              </View>
            )}
            <View style={styles.chips}>
              <Chip compact>Capital {money(preview.capital)}</Chip>
              <Chip compact>Plazo {preview.term_months} m</Chip>
              <Chip compact>Tasa {rateText(preview.rate)}% mensual</Chip>
              <Chip compact>{preview.payments} cuota{preview.payments === 1 ? "" : "s"}</Chip>
              <Chip compact>Interés nuevo {money(preview.new_interest_total)}</Chip>
              {Number(preview.carried_total) > 0 && <Chip compact>Cargos {money(preview.carried_total)}</Chip>}
              <Chip compact>Vence {preview.maturity_date}</Chip>
            </View>
            {shownCuotas.map((c) => (
              <View key={c.payment_number} style={styles.cuotaRow}>
                <Text style={{ color: COLORS.muted }}>{c.payment_number}. {c.payment_date}</Text>
                <Text style={{ fontWeight: "700", color: COLORS.text }}>{money(c.total)}</Text>
              </View>
            ))}
            {cuotas.length > shownCuotas.length && (
              <Text style={styles.hint}>… y {cuotas.length - shownCuotas.length} cuotas más.</Text>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.group}>Validaciones</Text>
          {CHECKS.map(([key, label]) => (
            <CheckLine key={key} label={label} checked={!!checks[key]} onToggle={() => toggleCheck(key)} />
          ))}
          <Text style={[styles.hint, { marginTop: SPACING.xs }]}>Marque al menos una:</Text>
          {COVERAGE_CHECKS.map(([key, label]) => (
            <CheckLine key={key} label={label} checked={!!checks[key]} onToggle={() => toggleCheck(key)} />
          ))}
        </View>

        <TextInput
          mode="outlined"
          label="Justificación"
          value={justification}
          onChangeText={setJustification}
          multiline
          numberOfLines={3}
          style={styles.input}
        />

        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <Button mode="contained" icon="send" loading={saving} disabled={saving || previewing || notActive} onPress={onSubmit} style={{ borderRadius: RADIUS.md }}>
          Enviar solicitud
        </Button>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
