import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, ActivityIndicator, HelperText, Chip } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { createCustomer } from "../api/customerApi";
import { getGenres, getMaritalStatuses, getBusinessTypes, getCountries } from "../api/customerCatalogApi";
import { getFrecuencies } from "../api/frecuencyApi";
import { getCustomFieldsForm, getLoanProducts } from "../api/loanFormApi";
import { getAccessibleBranches } from "../api/branchApi";
import { getSessionModules } from "../api/financeApi";
import { simulateLoan } from "../api/loanApi";
import { isNetworkError } from "../api/credimasterClient";
import CatalogPickerField from "../components/CatalogPickerField";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import { summarizeSchedule } from "../utils/loanSimulation";
import { money, formatAmountInput } from "../utils/format";
import { todayISO } from "../utils/date";
import { mapServerErrors, normalizeCedula, ageFromBirth, birthFromCedula } from "../utils/customerForm";
import {
  EMPTY_SHEET, HOUSING_OPTIONS, SHEET_LABELS, validateSheet, customerBodyFromSheet, loanPrefillFromSheet, missingCustomFields,
  YEARS_LIVING_KEY, HOUSING_KEY, EXPERIENCE_KEY,
} from "../utils/clientRequestSheet";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// «Solicitud de crédito nuevo» (hoja de JELDER): datos personales, del negocio y del préstamo de un cliente que todavía no
// existe, en una sola pantalla y en el orden de la hoja de papel. Al enviar se guarda al cliente como prospecto (solo queda
// guardado si se aprueba la solicitud) y se sigue con lo que el sistema exige después: ubicación y fotos, evaluación
// financiera y la solicitud de crédito con el monto, plazo, frecuencia y tasa ya puestos (CustomerSetupScreen).
// Se enciende con la política de crédito solicitud_cliente_nuevo_hoja (utils/clientRequestSheet.js).

const HIDDEN_FREQUENCIES = ["V", "IR", "NA"];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
  title: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  section: { fontWeight: "800", color: COLORS.primary, letterSpacing: 0.5, marginBottom: SPACING.xs },
  input: { backgroundColor: COLORS.card },
  row: { flexDirection: "row", gap: SPACING.sm },
  half: { flex: 1 },
  readOnly: { color: COLORS.text, fontWeight: "700", fontSize: 15 },
  readLabel: { color: COLORS.muted, fontSize: 12 },
  errorBox: {
    backgroundColor: COLORS.dangerSoft || "#fdecea",
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
});

const MONEY = ["other_incomes", "business_inventory", "cash_amount", "business_receivables", "amount"];

export default function ClientRequestSheetScreen({ navigation }) {
  const { session } = useContext(SessionContext);
  const canCreate = session?.permissions?.includes("clientes.insertar") && session?.permissions?.includes("creditos.insertar");
  const regulated = session?.tenant?.conami_regulated !== false;

  const [sheet, setSheet] = useState({ ...EMPTY_SHEET });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState([]);
  const [saving, setSaving] = useState(false);

  const [cat, setCat] = useState(null);
  const [catError, setCatError] = useState("");
  const [customFields, setCustomFields] = useState([]);
  const [modules, setModules] = useState(null);
  const [branchId, setBranchId] = useState(null);
  const [installment, setInstallment] = useState({ loading: false, value: null, error: "" });
  const rateTouched = useRef(false);

  const compliance = !Array.isArray(modules) || modules.includes("compliance");
  const opts = useMemo(() => ({ regulated, compliance }), [regulated, compliance]);

  const loadCatalogs = async () => {
    try {
      setCatError("");
      const [genres, marital, businessTypes, countries, frequencies, cf, products] = await Promise.all([
        getGenres(session.token),
        getMaritalStatuses(session.token),
        getBusinessTypes(session.token),
        getCountries(session.token),
        getFrecuencies(session.token),
        getCustomFieldsForm(session.token, "CUSTOMER").catch(() => null),
        getLoanProducts(session.token).catch(() => null),
      ]);
      const nicaragua = (countries || []).find((c) => /nicaragua/i.test(c.label));
      setCat({
        genres: genres || [],
        marital: marital || [],
        businessTypes: businessTypes || [],
        countryId: nicaragua?.id ?? null,
        frequencies: (frequencies || []).filter((f) => !HIDDEN_FREQUENCIES.includes(f.tag)),
        products: products?.data || [],
      });
      setCustomFields(cf?.data?.fields || []);
    } catch (e) {
      setCatError(e?.message || "No se pudieron cargar los catálogos. Revise la conexión.");
    }
  };

  useEffect(() => {
    loadCatalogs();
    getSessionModules(session.token).then(setModules).catch(() => {});
    getAccessibleBranches(session.token).then((r) => setBranchId(r?.data?.[0]?.id ?? null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Con un solo producto financiero disponible, su tasa propuesta va en el campo (se puede cambiar).
  useEffect(() => {
    if (!cat || rateTouched.current || sheet.rate) return;
    if (cat.products.length === 1 && cat.products[0].default_interest_rate != null) {
      setSheet((s) => ({ ...s, rate: Number(cat.products[0].default_interest_rate).toFixed(2) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const set = (field, value) => {
    setSheet((s) => ({ ...s, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
    setGeneral([]);
  };

  // Datos que salen de la cédula (la hoja pide la Edad: se calcula de la fecha de nacimiento que lleva la cédula).
  const birth = useMemo(() => birthFromCedula(normalizeCedula(sheet.identification)), [sheet.identification]);
  const age = birth ? ageFromBirth(birth) : "";

  const frequency = cat?.frequencies.find((f) => String(f.id) === String(sheet.frequencyId)) || null;

  // «Cuota que debe pagar»: se calcula con el monto, plazo, tasa y frecuencia (el mismo plan que verá el aprobador).
  useEffect(() => {
    const amount = Number(String(sheet.amount).replace(/,/g, ""));
    const term = Number(sheet.term);
    const rate = Number(sheet.rate);
    if (!(amount > 0) || !(term > 0) || !(rate > 0) || !frequency) {
      setInstallment({ loading: false, value: null, error: "" });
      return undefined;
    }
    let cancelled = false;
    setInstallment((i) => ({ ...i, loading: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        const table = await simulateLoan(session.token, {
          amount,
          interest_rate: rate,
          term,
          requestDate: todayISO(),
          fee: 0,
          insurance: 0,
          other_charges: 0,
          frequency_id: frequency.tag,
          branch_id: branchId,
        });
        const summary = summarizeSchedule(table);
        if (!cancelled) setInstallment({ loading: false, value: summary?.installment ?? null, error: summary ? "" : "No se pudo calcular" });
      } catch (e) {
        if (!cancelled) setInstallment({ loading: false, value: null, error: isNetworkError(e) ? "Sin señal para calcular la cuota" : "No se pudo calcular" });
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sheet.amount, sheet.term, sheet.rate, frequency, branchId, session.token]);

  const missing = useMemo(() => missingCustomFields(customFields), [customFields]);

  const send = async () => {
    if (saving) return;
    const found = validateSheet(sheet, { countryId: cat?.countryId }, opts);
    const custom = customFields.filter((f) => [YEARS_LIVING_KEY, HOUSING_KEY, EXPERIENCE_KEY].includes(f.field_key));
    if (missing.length) {
      setGeneral([`Esta empresa todavía no tiene creados los campos: ${missing.join(", ")}. Pídale al administrador que los cree (Configuración → Campos personalizados).`]);
      return;
    }
    const { _other, ...fieldErrors } = found;
    if (Object.keys(fieldErrors).length || _other) {
      setErrors(fieldErrors);
      setGeneral([
        Object.keys(fieldErrors).length ? `Faltan o están mal ${Object.keys(fieldErrors).length} campo(s): ${Object.keys(fieldErrors).map((k) => SHEET_LABELS[k]).join(", ")}.` : null,
        _other || null,
      ].filter(Boolean));
      return;
    }
    try {
      setSaving(true);
      setGeneral([]);
      const body = customerBodyFromSheet(sheet, { countryId: cat?.countryId }, custom);
      if (branchId) body.customer.branch_id = body.customer.branch_id || branchId;
      const res = await createCustomer(session.token, body);
      const id = res?.data?.id ?? res?.id;
      if (!id) {
        navigation.goBack();
        return;
      }
      // Cliente ya guardado como prospecto: sigue lo que el sistema exige (ubicación, evaluación) y la solicitud con
      // el monto, plazo, frecuencia y tasa de la hoja.
      navigation.replace("CustomerSetup", { customerId: id, customerName: sheet.customer_name.trim(), sheetLoan: loanPrefillFromSheet(sheet) });
    } catch (e) {
      if (isNetworkError(e)) {
        setGeneral(["Sin conexión: esta solicitud necesita señal para enviarse. Intente de nuevo cuando la tenga."]);
      } else if (e?.status === 409) {
        const text = e?.data?.errors?.[0]?.message || "Ya existe un cliente con esa cédula. Búsquelo en Clientes.";
        setErrors((prev) => ({ ...prev, identification: /en trámite/i.test(text) ? "Esa cédula ya tiene una solicitud en trámite" : "Ya existe un cliente con esa cédula" }));
        setGeneral([text]);
      } else if (e?.status === 400 && Array.isArray(e?.data?.errors)) {
        const { general: other, fields } = mapServerErrors(e.data.errors);
        setGeneral([...other, ...Object.entries(fields).map(([k, m]) => `${k}: ${m}`)]);
      } else {
        setGeneral([e?.message ?? "No se pudo enviar la solicitud"]);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", padding: SPACING.lg }]}>
        <Text style={{ color: COLORS.text, textAlign: "center", fontWeight: "700" }}>Su usuario no puede registrar solicitudes de cliente nuevo.</Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: SPACING.xs }}>
          Pídale al administrador los permisos «clientes.insertar» y «creditos.insertar».
        </Text>
      </SafeAreaView>
    );
  }
  if (catError) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", padding: SPACING.lg }]}>
        <Text style={{ color: COLORS.danger, textAlign: "center" }}>{catError}</Text>
        <Button mode="contained" onPress={loadCatalogs} style={{ marginTop: SPACING.md }}>Reintentar</Button>
      </SafeAreaView>
    );
  }
  if (!cat) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
        <Text style={[styles.sub, { marginTop: SPACING.sm }]}>Cargando…</Text>
      </SafeAreaView>
    );
  }

  const label = (field) => `${SHEET_LABELS[field]} *`;
  const text = (field, extra = {}) => (
    <View key={field}>
      <TextInput
        mode="outlined"
        label={extra.label || label(field)}
        value={sheet[field] == null ? "" : String(sheet[field])}
        onChangeText={(v) => {
          if (field === "rate") rateTouched.current = true;
          set(field, MONEY.includes(field) ? formatAmountInput(v) : v);
        }}
        error={!!errors[field]}
        style={styles.input}
        outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
        {...extra.props}
      />
      <HelperText type="error" visible={!!errors[field]}>{errors[field]}</HelperText>
    </View>
  );
  const pick = (field, options) => (
    <View key={field}>
      <CatalogPickerField label={label(field)} value={sheet[field]} options={options} onChange={(id) => set(field, id)} />
      <HelperText type="error" visible={!!errors[field]}>{errors[field]}</HelperText>
    </View>
  );
  const numeric = { props: { keyboardType: "decimal-pad" } };
  const date = todayISO().split("-").reverse().join("/");

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <View>
          <Text variant="titleLarge" style={styles.title}>Solicitud de crédito nuevo</Text>
          <Text style={styles.sub}>
            Llene toda la hoja. El cliente solo queda guardado si su solicitud se aprueba.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>DATOS PERSONALES</Text>
          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.readLabel}>Fecha</Text>
              <Text style={styles.readOnly}>{date}</Text>
            </View>
            <View style={styles.half}>{text("rate", { label: "(%) Tasa de interés *", ...numeric })}</View>
          </View>
          {text("customer_name")}
          {text("identification", { props: { autoCapitalize: "characters", autoCorrect: false } })}
          <View style={{ marginBottom: SPACING.xs }}>
            <Text style={styles.readLabel}>Edad (sale de la cédula)</Text>
            <Text style={styles.readOnly}>{age !== "" ? `${age} años` : "—"}</Text>
          </View>
          {text("cellphone", { props: { keyboardType: "phone-pad" } })}
          {pick("genre_id", cat.genres)}
          {pick("marital_status_id", cat.marital)}
          {text("occupation")}
          {text("home_address", { props: { multiline: true } })}
          {text("business_address", { props: { multiline: true } })}
          {text("years_living", numeric)}
          <View>
            <Text style={styles.readLabel}>{label("housing")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs }}>
              {HOUSING_OPTIONS.map((o) => (
                <Chip key={o} selected={sheet.housing === o} onPress={() => set("housing", o)} showSelectedCheck>
                  {o}
                </Chip>
              ))}
            </View>
            <HelperText type="error" visible={!!errors.housing}>{errors.housing}</HelperText>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>DATOS DEL NEGOCIO</Text>
          {pick("business_type_id", cat.businessTypes)}
          {text("experience", { label: "Experiencia (años) *", ...numeric })}
          {text("other_incomes", { label: "Otros ingresos C$ *", ...numeric })}
          <View style={styles.row}>
            <View style={styles.half}>{text("credit_sales", { label: "Vta. Crédito (%) *", ...numeric })}</View>
            <View style={styles.half}>{text("cash_sales", { label: "Contado (%) *", ...numeric })}</View>
          </View>
          {text("business_inventory", { label: "Inventario C$ *", ...numeric })}
          {text("cash_amount", { label: "Efectivo C$ *", ...numeric })}
          {text("business_receivables", { label: "Cuentas por cobrar C$ *", ...numeric })}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>DATOS DEL PRÉSTAMO</Text>
          {text("amount", { label: "Monto solicitado C$ *", ...numeric })}
          {text("term", { label: "Plazo solicitado (meses) *", ...numeric })}
          {pick("frequencyId", cat.frequencies.map((f) => ({ id: f.id, label: f.name })))}
          <View style={{ marginTop: SPACING.xs }}>
            <Text style={styles.readLabel}>Cuota que debe pagar</Text>
            <Text style={styles.readOnly}>
              {installment.loading ? "Calculando…" : installment.value != null ? money(installment.value) : installment.error || "—"}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>REFERENCIA PERSONAL</Text>
          <Text style={styles.sub}>El sistema pide al menos una referencia del cliente.</Text>
          {text("reference_name")}
          {text("reference_relationship")}
          {text("reference_telephone", { props: { keyboardType: "phone-pad" } })}
        </View>

        <Text style={styles.sub}>
          Doy fe que la información suministrada es verdadera y autorizo a la empresa a consultarme en las centrales de riesgo que considere convenientes.
        </Text>

        {!!general.length && (
          <View style={styles.errorBox}>
            {general.map((g, i) => (
              <Text key={i} style={{ color: COLORS.danger }}>{g}</Text>
            ))}
          </View>
        )}

        <Button mode="contained" onPress={send} loading={saving} disabled={saving} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 48 }}>
          Guardar y continuar
        </Button>
        <Text style={styles.sub}>
          Sigue la ubicación, la evaluación financiera y las garantías; la solicitud se envía a aprobación ya con el monto, plazo, frecuencia y tasa de esta hoja.
        </Text>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
