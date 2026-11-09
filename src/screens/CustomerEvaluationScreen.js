import React, { useContext, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, ActivityIndicator, HelperText, Chip } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { createEvaluation, getCurrentEvaluation, getEvaluationFormOptions } from "../api/customerEvaluationApi";
import { isNetworkError } from "../api/credimasterClient";
import { confirmAction } from "../utils/confirm";
import { money, toNumber, formatAmountInput } from "../utils/format";
import { todayISO } from "../utils/date";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Evaluación financiera del cliente desde la app (capacidad de pago, riesgo): se llenan
// ingresos, gastos y deudas del cliente (los conceptos los define cada empresa en la web),
// y el SERVIDOR calcula el puntaje, el riesgo y la recomendación, igual que en la web.
// Si el cliente ya tiene una evaluación vigente se muestra (para revisarla se usa la web).

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.sm },
  header: { fontWeight: "800", color: COLORS.text },
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  label: { color: COLORS.muted, flexShrink: 1 },
  value: { color: COLORS.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
});

// Si el servidor no responde la lista, los 6 conceptos que toda empresa trae de fábrica.
const FALLBACK_CONCEPTS = [
  { concept_key: "business_income", label: "Ingreso negocio", type: "INCOME" },
  { concept_key: "salary_income", label: "Salario", type: "INCOME" },
  { concept_key: "other_income", label: "Otros ingresos", type: "INCOME" },
  { concept_key: "business_expenses", label: "Gastos negocio", type: "EXPENSE" },
  { concept_key: "family_expenses", label: "Gastos familiares", type: "EXPENSE" },
  { concept_key: "other_debts_installments", label: "Otras cuotas", type: "DEBT" },
];
const FALLBACK_OPTIONS = {
  methodologies: [
    { value: "INDIVIDUAL", label: "Individual" },
    { value: "GRUPAL", label: "Grupal" },
    { value: "DESARROLLO_EMPRESARIAL", label: "Desarrollo empresarial" },
    { value: "PERSONAL", label: "Personal" },
  ],
  references: [
    { value: "FAVORABLE", label: "Favorable" },
    { value: "REGULAR", label: "Regular" },
    { value: "DESFAVORABLE", label: "Desfavorable" },
  ],
  bureau: [
    { value: "LIMPIO", label: "Limpio" },
    { value: "OBSERVADO", label: "Observado" },
    { value: "NEGATIVO", label: "Negativo" },
    { value: "NO_APLICA", label: "No aplica" },
  ],
};
const GROUP_LABEL = { INCOME: "Ingresos mensuales", EXPENSE: "Gastos mensuales", DEBT: "Deudas (cuotas de otros créditos)" };

const RISK_LABEL = { BAJO: "Bajo", MEDIO: "Medio", ALTO: "Alto", MUY_ALTO: "Muy alto" };
const RECOMMENDATION_LABEL = {
  APROBAR: "Aprobar",
  APROBAR_CON_CONDICIONES: "Aprobar con condiciones",
  RECHAZAR: "Rechazar",
  PENDIENTE: "Pendiente",
};
const riskColor = (r) => (r === "BAJO" ? COLORS.success : r === "MEDIO" ? COLORS.warning : COLORS.danger);
const recoColor = (r) => (r === "APROBAR" ? COLORS.success : r === "RECHAZAR" ? COLORS.danger : COLORS.warning);

function Row({ label, value, color }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function Choice({ options, value, onChange }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.value} selected={value === o.value} onPress={() => onChange(value === o.value ? "" : o.value)}>
          {o.label}
        </Chip>
      ))}
    </View>
  );
}

// Resultado (de la evaluación recién guardada o de la vigente).
function ResultCard({ ev, title }) {
  const concepts = Array.isArray(ev.concept_values) ? ev.concept_values : [];
  return (
    <View style={styles.card}>
      <Text variant="titleMedium" style={styles.header}>{title}</Text>
      <Row label="Puntaje final" value={String(ev.final_score)} />
      <Row label="Nivel de riesgo" value={RISK_LABEL[ev.risk_level] || ev.risk_level} color={riskColor(ev.risk_level)} />
      <Row label="Recomendación" value={RECOMMENDATION_LABEL[ev.recommendation] || ev.recommendation} color={recoColor(ev.recommendation)} />
      <Row label="Fecha" value={String(ev.evaluation_date || "").slice(0, 10)} />
      <Row label="Ingresos" value={money(ev.total_income)} />
      <Row label="Gastos y deudas" value={money(ev.total_expenses)} />
      <Row label="Flujo disponible" value={money(ev.available_cash_flow)} color={Number(ev.available_cash_flow) < 0 ? COLORS.danger : COLORS.success} />
      <Row label="Cuota propuesta" value={money(ev.proposed_installment)} />
      <Row label="Capacidad de pago (veces la cuota)" value={Number(ev.payment_capacity_ratio).toFixed(2)} />
      <Row label="Endeudamiento" value={`${(Number(ev.indebtedness_ratio) * 100).toFixed(0)} %`} />
      {concepts.length > 0 && <Text style={[styles.group, { marginTop: SPACING.sm }]}>Detalle</Text>}
      {concepts.map((c) => (
        <Row key={c.concept_key} label={c.concept_label || c.concept_key} value={money(c.value)} />
      ))}
    </View>
  );
}

export default function CustomerEvaluationScreen({ route, navigation }) {
  const { customerId, customerName } = route.params;
  const { session } = useContext(SessionContext);
  const canCreate = session?.permissions?.includes("clientes.evaluacion.insertar");

  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(null);
  const [concepts, setConcepts] = useState(FALLBACK_CONCEPTS);
  const [options, setOptions] = useState(FALLBACK_OPTIONS);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [methodology, setMethodology] = useState("INDIVIDUAL");
  const [values, setValues] = useState({});
  const [proposed, setProposed] = useState("");
  const [years, setYears] = useState("");
  const [sales, setSales] = useState("");
  const [inventory, setInventory] = useState("");
  const [bizLocation, setBizLocation] = useState("");
  const [references, setReferences] = useState("");
  const [bureau, setBureau] = useState("NO_APLICA");
  const [comment, setComment] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cur = await getCurrentEvaluation(session.token, customerId).catch(() => null);
        if (alive) setCurrent(cur && cur.id ? cur : null);
        if (canCreate) {
          const opts = await getEvaluationFormOptions(session.token).catch(() => null);
          if (alive && opts?.concepts?.length) {
            setConcepts(opts.concepts);
            setOptions({
              methodologies: opts.methodologies || FALLBACK_OPTIONS.methodologies,
              references: opts.references || FALLBACK_OPTIONS.references,
              bureau: opts.bureau || FALLBACK_OPTIONS.bureau,
            });
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [session.token, customerId, canCreate]);

  // Vista previa de los totales mientras se escribe (el servidor recalcula todo al guardar).
  const totals = useMemo(() => {
    let income = 0;
    let expenses = 0;
    let debts = 0;
    for (const c of concepts) {
      const v = toNumber(values[c.concept_key]);
      if (c.type === "INCOME") income += v;
      else if (c.type === "EXPENSE") expenses += v;
      else if (c.type === "DEBT") { expenses += v; debts += v; }
    }
    const available = income - expenses;
    const inst = toNumber(proposed);
    return {
      income,
      expenses,
      available,
      capacity: inst > 0 ? available / inst : null,
      indebtedness: income > 0 ? debts / income : null,
    };
  }, [concepts, values, proposed]);

  const doSave = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        customer_id: Number(customerId),
        evaluation_date: todayISO(),
        methodology,
        concept_values: Object.fromEntries(concepts.map((c) => [c.concept_key, toNumber(values[c.concept_key])])),
        proposed_installment: toNumber(proposed),
        years_in_business: years.trim() === "" ? null : Number(years.replace(",", ".")),
        monthly_sales: toNumber(sales),
        inventory_value: toNumber(inventory),
        business_location: bizLocation.trim() || null,
        references_result: references || null,
        bureau_result: bureau || "NO_APLICA",
        analyst_comment: comment.trim() || null,
      };
      const res = await createEvaluation(session.token, payload);
      setSaved({ ...res, concept_values: concepts.map((c) => ({ concept_key: c.concept_key, concept_label: c.label, value: toNumber(values[c.concept_key]) })) });
    } catch (e) {
      if (isNetworkError(e)) {
        setError("Sin conexión. Para guardar la evaluación hace falta señal: conéctese y vuelva a intentar.");
      } else if (e?.status === 409) {
        setError("Este cliente ya tiene una evaluación vigente. Para cambiarla use la web.");
        getCurrentEvaluation(session.token, customerId).then((c) => c?.id && setCurrent(c)).catch(() => {});
      } else {
        setError(e?.message ?? "No se pudo guardar la evaluación");
      }
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (totals.income <= 0) {
      setError("Anote al menos un ingreso del cliente.");
      return;
    }
    if (toNumber(proposed) <= 0) {
      setError("Anote la cuota que se propone (para medir la capacidad de pago).");
      return;
    }
    setError("");
    confirmAction("Guardar evaluación", `Se registrará la evaluación financiera de ${customerName || "el cliente"}.`, doSave, {
      confirmText: "Guardar",
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  const done = saved || current;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="titleMedium" style={styles.header}>{customerName || "Cliente"}</Text>

        {done ? (
          <>
            <ResultCard ev={done} title={saved ? "Evaluación guardada" : "Evaluación vigente"} />
            {!saved && (
              <Text style={styles.hint}>
                Este cliente ya tiene una evaluación vigente. Para hacer una nueva versión use la web (Cliente → Evaluación financiera).
              </Text>
            )}
            <Button mode="contained" onPress={() => navigation.goBack()} style={{ borderRadius: RADIUS.md }}>
              Listo
            </Button>
          </>
        ) : !canCreate ? (
          <Text style={styles.hint}>Su usuario no tiene permiso para registrar evaluaciones financieras.</Text>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.group}>Metodología</Text>
              <Choice options={options.methodologies} value={methodology} onChange={(v) => v && setMethodology(v)} />
            </View>

            {["INCOME", "EXPENSE", "DEBT"].map((type) => {
              const list = concepts.filter((c) => c.type === type);
              if (!list.length) return null;
              return (
                <View key={type} style={styles.card}>
                  <Text style={styles.group}>{GROUP_LABEL[type]}</Text>
                  {list.map((c) => (
                    <TextInput
                      key={c.concept_key}
                      mode="outlined"
                      dense
                      label={c.label}
                      value={values[c.concept_key] ?? ""}
                      onChangeText={(t) => setValues((p) => ({ ...p, [c.concept_key]: formatAmountInput(t) }))}
                      keyboardType="decimal-pad"
                      style={styles.input}
                    />
                  ))}
                </View>
              );
            })}

            <View style={styles.card}>
              <Text style={styles.group}>Cuota y negocio</Text>
              <TextInput
                mode="outlined" dense label="Cuota propuesta" value={proposed}
                onChangeText={(t) => setProposed(formatAmountInput(t))} keyboardType="decimal-pad" style={styles.input}
              />
              <TextInput
                mode="outlined" dense label="Años en el negocio" value={years}
                onChangeText={(t) => setYears(t.replace(/[^\d.,]/g, ""))} keyboardType="decimal-pad" style={styles.input}
              />
              <TextInput
                mode="outlined" dense label="Ventas mensuales" value={sales}
                onChangeText={(t) => setSales(formatAmountInput(t))} keyboardType="decimal-pad" style={styles.input}
              />
              <TextInput
                mode="outlined" dense label="Valor del inventario" value={inventory}
                onChangeText={(t) => setInventory(formatAmountInput(t))} keyboardType="decimal-pad" style={styles.input}
              />
              <TextInput
                mode="outlined" dense label="Ubicación del negocio" value={bizLocation}
                onChangeText={setBizLocation} style={styles.input}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.group}>Referencias</Text>
              <Choice options={options.references} value={references} onChange={setReferences} />
              <Text style={[styles.group, { marginTop: SPACING.sm }]}>Central de riesgo (buró)</Text>
              <Choice options={options.bureau} value={bureau} onChange={(v) => setBureau(v || "NO_APLICA")} />
              <TextInput
                mode="outlined" dense multiline label="Comentario del analista (opcional)" value={comment}
                onChangeText={setComment} style={[styles.input, { marginTop: SPACING.sm }]}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.group}>Resumen (se confirma al guardar)</Text>
              <Row label="Ingresos" value={money(totals.income)} />
              <Row label="Gastos y deudas" value={money(totals.expenses)} />
              <Row label="Flujo disponible" value={money(totals.available)} color={totals.available < 0 ? COLORS.danger : COLORS.success} />
              {totals.capacity != null && <Row label="Capacidad de pago (veces la cuota)" value={totals.capacity.toFixed(2)} />}
              {totals.indebtedness != null && <Row label="Endeudamiento" value={`${(totals.indebtedness * 100).toFixed(0)} %`} />}
              <Text style={styles.hint}>El puntaje, el riesgo y la recomendación los calcula el sistema al guardar, con los documentos que ya tiene el cliente.</Text>
            </View>

            <HelperText type="error" visible={!!error}>{error}</HelperText>
            <Button mode="contained" icon="content-save" onPress={save} loading={saving} disabled={saving} style={{ borderRadius: RADIUS.md }}>
              Guardar evaluación
            </Button>
          </>
        )}
        {!!error && (done || !canCreate) && <HelperText type="error" visible>{error}</HelperText>}
      </ScrollView>
    </SafeAreaView>
  );
}
