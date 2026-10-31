import React, { useContext, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, Chip, IconButton, ActivityIndicator, HelperText } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { simulateLoan } from "../api/loanApi";
import { getFrecuencies } from "../api/frecuencyApi";
import { getCreditPolicies } from "../api/creditPolicyApi";
import { getAccessibleBranches } from "../api/branchApi";
import { useTenantLogo } from "../hooks/useTenantLogo";
import ShareCardHeader from "../components/ShareCardHeader";
import { shareImage } from "../utils/shareImage";
import {
  summarizeSchedule,
  policyWarnings,
  parseSimulationInput,
  maxInstallment,
  amountForInstallment,
  comparableTerms,
} from "../utils/loanSimulation";
import { money, toNumber, formatAmountInput } from "../utils/format";
import { todayISO, shiftDay } from "../utils/date";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";

// Frecuencias que el simulador ofrece. "Al vencimiento" exige fecha de
// vencimiento, e "Irregular" / "No aplica" no tienen cuotas regulares.
const HIDDEN_FREQUENCIES = ["V", "IR", "NA"];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  headerRow: { flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  label: { fontWeight: "700", color: COLORS.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  input: { backgroundColor: COLORS.card },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bigLabel: { color: COLORS.muted, fontSize: 12 },
  bigValue: { color: COLORS.primary, fontWeight: "800", fontSize: 32 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rowLabel: { color: COLORS.muted },
  rowValue: { color: COLORS.text, fontWeight: "700" },
  warn: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 2,
  },
  warnText: { color: COLORS.text, fontSize: 12 },
  th: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  td: { color: COLORS.text, fontSize: 11 },
  shot: { gap: SPACING.md, backgroundColor: COLORS.bg },
});

function Row({ label, value, strong }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontSize: 16, color: COLORS.primary }]}>{value}</Text>
    </View>
  );
}

// Tabla de pagos (compacta para que entre en el teléfono y en la imagen).
function ScheduleTable({ rows }) {
  const cols = [
    ["#", 0.45, "left"],
    ["Fecha", 1.35, "left"],
    ["Cuota", 1.2, "right"],
    ["Capital", 1.2, "right"],
    ["Interés", 1.1, "right"],
    ["Saldo", 1.3, "right"],
  ];
  const fmt = (v) => money(v).replace("C$", "");
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Tabla de pagos (C$)</Text>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 4 }}>
        {cols.map(([h, flex, align]) => (
          <Text key={h} style={[styles.th, { flex, textAlign: align }]}>{h}</Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.paymentNumber} style={{ flexDirection: "row", paddingVertical: 3 }}>
          <Text style={[styles.td, { flex: cols[0][1] }]}>{r.paymentNumber}</Text>
          <Text style={[styles.td, { flex: cols[1][1] }]}>{String(r.paymentDate).slice(0, 10)}</Text>
          <Text style={[styles.td, { flex: cols[2][1], textAlign: "right", fontWeight: "700" }]}>{fmt(r.paymentAmount)}</Text>
          <Text style={[styles.td, { flex: cols[3][1], textAlign: "right" }]}>{fmt(r.principal)}</Text>
          <Text style={[styles.td, { flex: cols[4][1], textAlign: "right" }]}>{fmt(r.interest)}</Text>
          <Text style={[styles.td, { flex: cols[5][1], textAlign: "right" }]}>{fmt(r.remainingBalance)}</Text>
        </View>
      ))}
    </View>
  );
}

// Simulador de crédito: monto, plazo (meses), tasa mensual y frecuencia dan la
// cuota, lo que se paga en total y la tabla de pagos, con el MISMO cálculo que
// usa la solicitud de crédito (el tipo de interés lo define la empresa). No
// guarda nada. Se puede compartir como imagen y seguir a una solicitud.
export default function LoanSimulatorScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);

  const [frecuencies, setFrecuencies] = useState([]);
  const [policies, setPolicies] = useState({});
  const [branchId, setBranchId] = useState(null);

  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("");
  const [rate, setRate] = useState("");
  const [frequencyTag, setFrequencyTag] = useState("M");
  const [startDate, setStartDate] = useState(todayISO());
  const [showCharges, setShowCharges] = useState(false);
  const [fee, setFee] = useState("");
  const [insurance, setInsurance] = useState("");
  const [otherCharges, setOtherCharges] = useState("");

  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { summary, input, frequency }
  const [showTable, setShowTable] = useState(false);

  // "fwd": del monto a la cuota. "rev": de la cuota que el cliente puede pagar
  // al monto máximo que puede pedir.
  const [mode, setMode] = useState("fwd");
  const [target, setTarget] = useState("");
  const [compare, setCompare] = useState(null); // { loading, rows, error }

  const canCreate = session?.permissions?.includes("creditos.insertar");

  useEffect(() => {
    getFrecuencies(session.token).then((rows) => setFrecuencies(rows || [])).catch(() => {});
    getAccessibleBranches(session.token).then((res) => setBranchId(res?.data?.[0]?.id ?? null)).catch(() => {});
    getCreditPolicies(session.token)
      .then((rows) => {
        const map = {};
        (rows || []).forEach((p) => { map[p.policy_key] = p.policy_value; });
        setPolicies(map);
      })
      .catch(() => {});
  }, [session.token]);

  const visibleFrequencies = frecuencies.filter((f) => !HIDDEN_FREQUENCIES.includes(f.tag));
  const frequency = frecuencies.find((f) => f.tag === frequencyTag);

  const inputs = (termOverride) =>
    parseSimulationInput({
      amount: mode === "rev" ? "" : amount,
      term: termOverride ?? term,
      rate,
      // En "¿cuánto puedo pedir?" no hay cargos fijos: así la cuota es
      // proporcional al monto y el cálculo es exacto.
      fee: mode === "rev" ? "" : fee,
      insurance: mode === "rev" ? "" : insurance,
      otherCharges: mode === "rev" ? "" : otherCharges,
    });

  const runSim = (input, amountValue, termValue) =>
    simulateLoan(session.token, {
      amount: amountValue,
      interest_rate: input.rate,
      term: termValue,
      requestDate: startDate,
      fee: input.fee,
      insurance: input.insurance,
      other_charges: input.otherCharges,
      frequency_id: frequencyTag,
      branch_id: branchId,
    });

  const simulate = async (termOverride) => {
    setError("");
    setCompare(null);
    const input = inputs(termOverride);
    const goal = toNumber(target);
    if (mode === "rev" ? !goal : !input.amount) return setError(mode === "rev" ? "Ingresá la cuota que el cliente puede pagar." : "Ingresá el monto del crédito.");
    if (!input.term) return setError("Ingresá el plazo en meses.");
    if (!input.rate) return setError("Ingresá la tasa de interés mensual.");
    try {
      setLoading(true);
      let amountValue = input.amount;
      let reverse = null;
      let summary;
      if (mode === "rev") {
        // Se simula un monto de prueba y se escala a la cuota pedida; luego se
        // verifica y, si por redondeo se pasa, se baja de a C$100.
        const probe = summarizeSchedule(await runSim(input, 10000, input.term));
        amountValue = amountForInstallment(goal, 10000, maxInstallment(probe));
        if (amountValue <= 0) throw new Error("Esa cuota es muy baja para ese plazo y esa tasa.");
        summary = summarizeSchedule(await runSim(input, amountValue, input.term));
        for (let i = 0; i < 5 && summary && maxInstallment(summary) > goal && amountValue > 100; i += 1) {
          amountValue -= 100;
          summary = summarizeSchedule(await runSim(input, amountValue, input.term));
        }
        reverse = { target: goal };
      } else {
        summary = summarizeSchedule(await runSim(input, amountValue, input.term));
      }
      if (!summary) throw new Error("No se pudo calcular el plan de pagos con esos datos.");
      setResult({ summary, input: { ...input, amount: amountValue }, frequency, startDate, reverse });
    } catch (e) {
      setResult(null);
      setError(e?.message || "No se pudo simular. Revisá los datos y tu conexión.");
    } finally {
      setLoading(false);
    }
  };

  // Compara varios plazos con los mismos datos: la cuota y el total de cada uno
  // (modo normal) o el monto máximo de cada uno (modo "¿cuánto puedo pedir?").
  const runCompare = async () => {
    setError("");
    const input = inputs();
    const goal = toNumber(target);
    if (mode === "rev" ? !goal : !input.amount) return setError(mode === "rev" ? "Ingresá la cuota que el cliente puede pagar." : "Ingresá el monto del crédito.");
    if (!input.rate) return setError("Ingresá la tasa de interés mensual.");
    setCompare({ loading: true, rows: [], error: "" });
    const rows = await Promise.all(
      comparableTerms(policies).map(async (termValue) => {
        try {
          if (mode === "rev") {
            const probe = summarizeSchedule(await runSim(input, 10000, termValue));
            const amountValue = amountForInstallment(goal, 10000, maxInstallment(probe));
            return amountValue > 0 ? { term: termValue, amount: amountValue } : null;
          }
          const sum = summarizeSchedule(await runSim(input, input.amount, termValue));
          return sum ? { term: termValue, installment: sum.installment, installments: sum.installments, total: sum.total } : null;
        } catch {
          return null;
        }
      }),
    );
    const ok = rows.filter(Boolean);
    setCompare({ loading: false, rows: ok, error: ok.length ? "" : "No se pudo comparar con esos datos." });
  };

  const pickTerm = (termValue) => {
    setTerm(String(termValue));
    simulate(termValue);
  };

  const onShare = async () => {
    try {
      setSharing(true);
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Simulación de crédito");
    } catch (e) {
      setError(e?.message ?? "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const startRequest = () => {
    if (!result) return;
    navigation.push("NewLoanRequest", {
      sim: {
        amount: result.input.amount,
        term: result.input.term,
        interestRate: result.input.rate,
        frequencyId: result.frequency?.id,
        fee: result.input.fee,
        insurance: result.input.insurance,
        otherCharges: result.input.otherCharges,
      },
    });
  };

  const warnings = result ? policyWarnings(policies, result.input) : [];
  const s = result?.summary;
  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text variant="headlineSmall" style={styles.title}>Simulador de crédito</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.chips}>
            {[["fwd", "Calcular cuota"], ["rev", "¿Cuánto puedo pedir?"]].map(([key, label]) => (
              <Chip
                key={key}
                selected={mode === key}
                showSelectedCheck={false}
                onPress={() => {
                  setMode(key);
                  setResult(null);
                  setCompare(null);
                  setError("");
                }}
                style={{ backgroundColor: mode === key ? COLORS.primarySoft : COLORS.bg }}
              >
                {label}
              </Chip>
            ))}
          </View>
          <TextInput
            mode="outlined"
            label={mode === "rev" ? "Cuota que puede pagar (C$)" : "Monto del crédito (C$)"}
            value={mode === "rev" ? target : amount}
            onChangeText={(v) => (mode === "rev" ? setTarget(formatAmountInput(v)) : setAmount(formatAmountInput(v)))}
            keyboardType="decimal-pad"
            style={styles.input}
            outlineStyle={{ borderRadius: RADIUS.md }}
            left={<TextInput.Icon icon="cash" />}
          />
          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            <TextInput
              mode="outlined"
              label="Plazo (meses)"
              value={term}
              onChangeText={(t) => setTerm(t.replace(/[^\d]/g, ""))}
              keyboardType="number-pad"
              style={[styles.input, { flex: 1 }]}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
            <TextInput
              mode="outlined"
              label="Tasa mensual (%)"
              value={rate}
              onChangeText={(t) => setRate(t.replace(/[^\d.,]/g, ""))}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1 }]}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
          </View>

          <Text style={styles.label}>Frecuencia de pago</Text>
          <View style={styles.chips}>
            {visibleFrequencies.length === 0 && <ActivityIndicator size="small" />}
            {visibleFrequencies.map((f) => (
              <Chip
                key={f.id}
                selected={frequencyTag === f.tag}
                showSelectedCheck={false}
                onPress={() => setFrequencyTag(f.tag)}
                style={{ backgroundColor: frequencyTag === f.tag ? COLORS.primarySoft : COLORS.bg }}
              >
                {f.name}
              </Chip>
            ))}
          </View>

          <View style={styles.dateRow}>
            <Text style={styles.label}>Desembolso</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <IconButton icon="chevron-left" onPress={() => setStartDate(shiftDay(startDate, -1))} disabled={startDate <= todayISO()} />
              <Text style={{ color: COLORS.text, fontWeight: "700", minWidth: 96, textAlign: "center" }}>
                {startDate === todayISO() ? "Hoy" : startDate}
              </Text>
              <IconButton icon="chevron-right" onPress={() => setStartDate(shiftDay(startDate, 1))} />
            </View>
          </View>

          {mode === "fwd" ? (
            <>
          <Button mode="text" icon={showCharges ? "chevron-up" : "chevron-down"} onPress={() => setShowCharges(!showCharges)} style={{ alignSelf: "flex-start" }}>
                Cargos adicionales (opcional)
              </Button>
              {showCharges && (
                <View style={{ gap: SPACING.sm }}>
                  {[
                    ["Comisión (C$, total)", fee, setFee],
                    ["Seguro (C$, total)", insurance, setInsurance],
                    ["Otros cargos (C$, total)", otherCharges, setOtherCharges],
                  ].map(([label, value, setter]) => (
                    <TextInput
                      key={label}
                      mode="outlined"
                      label={label}
                      value={value}
                      onChangeText={(t) => setter(formatAmountInput(t))}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      outlineStyle={{ borderRadius: RADIUS.md }}
                    />
                  ))}
                  <Text style={{ color: COLORS.muted, fontSize: 11 }}>Se reparten en partes iguales entre las cuotas.</Text>
                </View>
              )}

            </>
          ) : (
            <Text style={{ color: COLORS.muted, fontSize: 11 }}>
              El monto máximo se calcula sin comisión, seguro ni otros cargos.
            </Text>
          )}

          <HelperText type="error" visible={!!error}>{error}</HelperText>
          <Button mode="contained" icon="calculator-variant" onPress={() => simulate()} loading={loading} disabled={loading} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
            Simular
          </Button>
        </View>

        <Button mode="outlined" icon="table-multiple" onPress={runCompare} disabled={compare?.loading} loading={compare?.loading} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
          Comparar plazos
        </Button>

        {compare && !compare.loading && (
          <View style={styles.card}>
            <Text style={styles.label}>
              {mode === "rev"
                ? `Con una cuota de ${money(toNumber(target))} se puede pedir:`
                : `Un crédito de ${money(toNumber(amount))} según el plazo:`}
            </Text>
            {!!compare.error && <Text style={{ color: COLORS.danger }}>{compare.error}</Text>}
            {compare.rows.map((r) => (
              <Pressable
                key={r.term}
                onPress={() => pickTerm(r.term)}
                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "700", width: 76 }}>{r.term} meses</Text>
                {mode === "rev" ? (
                  <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 16 }}>hasta {money(r.amount)}</Text>
                ) : (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: COLORS.primary, fontWeight: "800" }}>{money(r.installment)} × {r.installments}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 11 }}>Total {money(r.total)}</Text>
                  </View>
                )}
              </Pressable>
            ))}
            <Text style={{ color: COLORS.muted, fontSize: 11 }}>Tocá un plazo para ver su plan de pagos completo.</Text>
          </View>
        )}

        {warnings.length > 0 && (
          <View style={styles.warn}>
            <Text style={{ color: COLORS.warning, fontWeight: "800" }}>Fuera de la política de crédito</Text>
            {warnings.map((w) => (
              <Text key={w} style={styles.warnText}>• {w}</Text>
            ))}
          </View>
        )}

        {s && (
          <>
            <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={styles.shot}>
              <ShareCardHeader
                logoUrl={logoUrl}
                tenantName={tenantName}
                title="Simulación de crédito"
                lines={[
                  `Fecha: ${todayISO()} · Desembolso: ${result.startDate}`,
                  `Monto ${money(result.input.amount)} · ${result.input.term} meses · ${result.input.rate}% mensual`,
                  `Pago ${String(result.frequency?.name || "").toLowerCase()}`,
                  result.reverse ? `Cuota que puede pagar: ${money(result.reverse.target)}` : "",
                ]}
              />
              {result.reverse && (
                <View style={styles.card}>
                  <Text style={styles.bigLabel}>Puede pedir hasta</Text>
                  <Text style={styles.bigValue}>{money(result.input.amount)}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                    pagando {money(result.reverse.target)} por cuota, a {result.input.term} meses y {result.input.rate}% mensual.
                  </Text>
                </View>
              )}
              <View style={styles.card}>
                <Text style={styles.bigLabel}>
                  Cuota {String(result.frequency?.name || "").toLowerCase()} ({s.installments} cuotas)
                </Text>
                <Text style={styles.bigValue}>{money(s.installment)}</Text>
                {Math.abs(s.lastInstallment - s.installment) >= 0.01 && (
                  <Text style={{ color: COLORS.muted, fontSize: 12 }}>La última cuota es de {money(s.lastInstallment)} por ajuste de redondeo.</Text>
                )}
                <Row label="Capital" value={money(s.principal)} />
                <Row label="Intereses" value={money(s.interest)} />
                {s.charges > 0 && <Row label="Comisión, seguro y otros" value={money(s.charges)} />}
                <Row label="Total a pagar" value={money(s.total)} strong />
                <Row label="Primera cuota" value={s.firstDate} />
                <Row label="Última cuota" value={s.lastDate} />
              </View>
              {showTable && <ScheduleTable rows={s.rows} />}
              <Text style={{ color: COLORS.muted, fontSize: 11, textAlign: "center" }}>
                Simulación informativa: el crédito real depende de su aprobación.
              </Text>
            </ViewShot>

            <Button mode="outlined" icon={showTable ? "table-eye-off" : "table-eye"} onPress={() => setShowTable(!showTable)} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
              {showTable ? "Ocultar tabla de pagos" : "Ver tabla de pagos"}
            </Button>
            <Button mode="outlined" icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
              Compartir simulación (imagen)
            </Button>
            {canCreate && (
              <Button mode="contained" icon="file-document-plus-outline" onPress={startRequest} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
                Crear solicitud con estos datos
              </Button>
            )}
          </>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
