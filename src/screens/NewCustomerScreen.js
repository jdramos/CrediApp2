import React, { useContext, useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, ActivityIndicator, HelperText, Chip } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { createCustomer } from "../api/customerApi";
import { getAccessibleBranches } from "../api/branchApi";
import {
  getCountries, getProvinces, getMunicipalities, getGenres, getMaritalStatuses,
  getDocumentTypes, getBusinessTypes, getEconomicActivities,
} from "../api/customerCatalogApi";
import { isNetworkError } from "../api/credimasterClient";
import CatalogPickerField from "../components/CatalogPickerField";
import { DateWheelField } from "../components/DateWheelPicker";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import { confirmAction } from "../utils/confirm";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import { newLocalCustomerId, hasQueuedCustomerWithIdentification } from "../offline/localCustomers";
import {
  STEPS, EMPTY_FORM, CEDULA_TYPE_ID, FIELD_INFO, needsSpouse, isRequired, validateForm, firstStepWithError,
  buildCustomerPayload, mapServerErrors, maskDate, addYears, ageFromBirth, birthFromCedula, normalizeCedula,
} from "../utils/customerForm";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted },
  bars: { flexDirection: "row", gap: 4, marginTop: SPACING.xs, marginBottom: SPACING.xs },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: COLORS.border },
  barDone: { backgroundColor: COLORS.primary },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  group: { fontWeight: "800", color: COLORS.muted, fontSize: 12, textTransform: "uppercase", marginTop: SPACING.xs },
  input: { backgroundColor: COLORS.card },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  buttons: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  summary: { color: COLORS.text },
  errBox: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: 2,
  },
});

// Nuevo cliente desde la app (dueño, 2026-11-07). Solo con el permiso
// clientes.insertar. Por pasos para el teléfono; las reglas (qué es obligatorio
// según si la empresa está regulada por la CONAMI, cédula, PEP) están en
// utils/customerForm.js y el servidor las vuelve a validar al guardar.
export default function NewCustomerScreen({ navigation }) {
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();
  const canCreate = session?.permissions?.includes("clientes.insertar");
  const regulated = session?.tenant?.conami_regulated !== false;
  const modules = session?.tenant?.enabled_modules;
  const compliance = !Array.isArray(modules) || modules.includes("compliance");
  const opts = useMemo(() => ({ regulated, compliance }), [regulated, compliance]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [cat, setCat] = useState(null); // catálogos principales
  const [catError, setCatError] = useState("");
  const [activities, setActivities] = useState(null);
  const [activitiesError, setActivitiesError] = useState("");
  const [branches, setBranches] = useState([]);

  const loadCatalogs = async () => {
    setCatError("");
    setCat(null);
    try {
      const t = session.token;
      const [countries, provinces, municipalities, genres, marital, docTypes, businessTypes] = await Promise.all([
        getCountries(t), getProvinces(t), getMunicipalities(t), getGenres(t),
        getMaritalStatuses(t), getDocumentTypes(t), getBusinessTypes(t),
      ]);
      setCat({ countries, provinces, municipalities, genres, marital, docTypes, businessTypes });

      // Valores de arranque: el tipo de documento por omisión (cédula) y el país favorito.
      const docDefault = docTypes.find((d) => d.is_default) || docTypes.find((d) => Number(d.id) === CEDULA_TYPE_ID);
      const fav = countries.find((c) => c.favorite);
      setForm((prev) => ({
        ...prev,
        identity_type: prev.identity_type ?? docDefault?.id ?? null,
        identity_issue_country: prev.identity_issue_country ?? fav?.id ?? null,
        birth_country_id: prev.birth_country_id ?? fav?.id ?? null,
        nationality_id: prev.nationality_id ?? fav?.id ?? null,
        residence_country_id: prev.residence_country_id ?? fav?.id ?? null,
      }));
    } catch (e) {
      setCatError(
        e?.status === 403
          ? "Su usuario no tiene permiso para ver los catálogos (catalogos.ver). Pídaselo al administrador."
          : isNetworkError(e)
            ? "Sin conexión y los catálogos todavía no están guardados en el teléfono. Abra esta pantalla una vez con señal para poder registrar clientes sin conexión."
            : e?.message ?? "No se pudieron cargar los catálogos",
      );
    }
  };

  useEffect(() => {
    if (!canCreate) return;
    loadCatalogs();
    getAccessibleBranches(session.token).then((r) => setBranches(r?.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);

  // La lista de actividades CONAMI es larga: se pide al llegar a ese paso.
  useEffect(() => {
    if (step !== 2 || activities) return;
    setActivitiesError("");
    getEconomicActivities(session.token)
      .then(setActivities)
      .catch((e) => setActivitiesError(e?.message ?? "No se pudo cargar la lista de actividades"));
  }, [step, activities, session?.token]);

  const setF = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const onIdentification = (text) => {
    const isCedula = Number(form.identity_type) === CEDULA_TYPE_ID;
    const value = isCedula ? normalizeCedula(text) : text;
    setForm((prev) => {
      const next = { ...prev, identification: value };
      if (isCedula) {
        const birth = birthFromCedula(value);
        if (birth) {
          next.birth_date = birth;
          next.age = ageFromBirth(birth);
        }
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, identification: undefined, ...(isCedula ? { birth_date: undefined, age: undefined } : {}) }));
  };

  const onBirthDate = (text) => {
    const value = maskDate(text);
    setForm((prev) => ({ ...prev, birth_date: value, age: ageFromBirth(value) }));
    setErrors((prev) => ({ ...prev, birth_date: undefined, age: undefined }));
  };

  const onIssueDate = (text) => {
    const value = maskDate(text);
    setForm((prev) => {
      const next = { ...prev, identity_issue_date: value };
      const expires = addYears(value, 10);
      if (expires) next.identity_expiration_date = expires;
      return next;
    });
    setErrors((prev) => ({ ...prev, identity_issue_date: undefined, identity_expiration_date: undefined }));
  };

  const onProvince = (id) => {
    setForm((prev) => ({ ...prev, province_id: id, municipality_id: null }));
    setErrors((prev) => ({ ...prev, province_id: undefined, municipality_id: undefined }));
  };

  const onActivityType = (value) => {
    setForm((prev) => ({ ...prev, economic_activity: value }));
    setErrors((prev) => ({ ...prev, economic_activity: undefined }));
  };

  const req = (field) => isRequired(field, form, opts);
  const label = (text, field) => (req(field) ? `${text} *` : text);

  const text = (field, labelText, extra = {}) => (
    <View key={field}>
      <TextInput
        mode="outlined"
        label={label(labelText, field)}
        value={form[field] == null ? "" : String(form[field])}
        onChangeText={(v) => setF(field, v)}
        error={!!errors[field]}
        style={styles.input}
        outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
        {...extra}
      />
      <HelperText type="error" visible={!!errors[field]}>{errors[field]}</HelperText>
    </View>
  );

  // Fechas con selector de ruedas (día · mes · año); el formulario las guarda como AAAA-MM-DD.
  const thisYear = new Date().getFullYear();
  const DATE_RANGES = {
    birth_date: { minYear: 1920, maxYear: thisYear, defaultValue: `${thisYear - 30}-01-01` },
    identity_issue_date: { minYear: 1990, maxYear: thisYear },
    identity_expiration_date: { minYear: thisYear - 5, maxYear: thisYear + 30 },
    job_start_day: { minYear: 1970, maxYear: thisYear },
  };
  const dateField = (field, labelText, onChange) => (
    <View key={field}>
      <DateWheelField
        label={label(labelText, field)}
        value={form[field] || ""}
        onChange={(iso) => (onChange || ((v) => setF(field, maskDate(v))))(iso || "")}
        error={errors[field]}
        style={styles.input}
        outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
        {...(DATE_RANGES[field] || {})}
      />
    </View>
  );

  const pick = (field, labelText, options, extra = {}) => (
    <View key={field}>
      <CatalogPickerField
        label={label(labelText, field)}
        value={form[field]}
        options={options}
        onChange={extra.onChange || ((id) => setF(field, id))}
        disabled={extra.disabled}
      />
      <HelperText type="error" visible={!!errors[field]}>{errors[field]}</HelperText>
    </View>
  );

  const yesNo = (field, labelText) => (
    <View key={field}>
      <Text style={{ fontWeight: "700", color: COLORS.text, marginTop: SPACING.xs }}>{label(labelText, field)}</Text>
      <View style={[styles.chips, { marginTop: SPACING.xs }]}>
        <Chip selected={form[field] === true} onPress={() => setF(field, true)}>Sí</Chip>
        <Chip selected={form[field] === false} onPress={() => setF(field, false)}>No</Chip>
      </View>
      <HelperText type="error" visible={!!errors[field]}>{errors[field]}</HelperText>
    </View>
  );

  const goTo = (n) => {
    setStep(n);
  };

  const next = () => {
    const found = validateForm(form, opts, step);
    setGeneral([]);
    if (Object.keys(found).length) {
      setErrors((prev) => ({ ...prev, ...found }));
      setGeneral(["Revise los campos marcados en rojo."]);
      return;
    }
    goTo(step + 1);
  };

  const save = () => {
    const found = validateForm(form, opts);
    setGeneral([]);
    if (Object.keys(found).length) {
      setErrors(found);
      const at = firstStepWithError(found);
      setGeneral([
        `Faltan datos en: ${[...new Set(Object.keys(found).map((f) => (FIELD_INFO[f] ? STEPS[FIELD_INFO[f][0]].title : "Cumplimiento")))].join(", ")}.`,
      ]);
      if (at !== null && at !== step) goTo(at);
      return;
    }
    confirmAction(
      "Guardar cliente",
      `Se registrará a ${form.customer_name.trim()} (${form.identification.trim()}).`,
      doSave,
      { confirmText: "Guardar" },
    );
  };

  // Guarda el alta en la cola de pendientes. El cliente recibe un id local; lo que se le agregue
  // después (ubicación, fotos, evaluación) queda en la cola apuntando a ese id y se envía en orden
  // cuando el cliente ya se registró (offline/syncManager.js).
  const queueCustomer = async () => {
    try {
      if (await hasQueuedCustomerWithIdentification(form.identification)) {
        setGeneral(["Ya hay un cliente con esa identificación esperando señal para registrarse (ver Pendientes de sincronizar)."]);
        return;
      }
      const localId = newLocalCustomerId();
      await enqueue({
        type: "CUSTOMER_CREATE",
        label: `Cliente nuevo — ${form.customer_name.trim()}`,
        payload: { localId, body: { ...buildCustomerPayload(form), prospect_request: true } },
      });
      refreshPendingCount();
      navigation.replace("CustomerSetup", { customerId: localId, customerName: form.customer_name.trim() });
    } catch (err) {
      setGeneral([err?.message ?? "No se pudo guardar el cliente en el teléfono"]);
    }
  };

  const doSave = async () => {
    if (saving) return;
    try {
      setSaving(true);
      setGeneral([]);
      // prospect_request: si la empresa tiene activa la política "cliente nuevo = prospecto", este
      // cliente solo queda guardado cuando se apruebe su solicitud de crédito (CustomerSetupScreen).
      const res = await createCustomer(session.token, { ...buildCustomerPayload(form), prospect_request: true });
      const id = res?.data?.id ?? res?.id;
      // Ya con el cliente creado: ubicación y fotos, documentos obligatorios, evaluación
      // financiera y la solicitud de crédito (CustomerSetupScreen).
      if (id) navigation.replace("CustomerSetup", { customerId: id, customerName: form.customer_name.trim() });
      else navigation.goBack();
    } catch (e) {
      if (isNetworkError(e)) {
        // Sin señal: se ofrece guardar el cliente en el teléfono (cola de pendientes) y seguir
        // con su expediente; se registra solo al volver la conexión.
        confirmAction(
          "Sin conexión",
          "No se pudo conectar al servidor. ¿Guardar este cliente en el teléfono para registrarlo automáticamente cuando vuelva la señal?",
          queueCustomer,
          { confirmText: "Guardar" },
        );
      } else if (e?.status === 409) {
        const inProcess = e?.data?.errors?.[0]?.message;
        const text = /en trámite/i.test(String(inProcess || ""))
          ? inProcess
          : "Ya existe un cliente con esa identificación. Búsquelo en Clientes.";
        setErrors((prev) => ({ ...prev, identification: /en trámite/i.test(text) ? "Esa cédula ya tiene una solicitud en trámite" : "Ya existe un cliente con esa identificación" }));
        setGeneral([text]);
        goTo(0);
      } else if (e?.status === 400 && Array.isArray(e?.data?.errors)) {
        const { fields, general: other } = mapServerErrors(e.data.errors);
        setErrors((prev) => ({ ...prev, ...fields }));
        setGeneral([
          ...Object.entries(fields).map(([f, m]) => `${FIELD_INFO[f][1]}: ${m}`),
          ...other,
        ]);
        const at = firstStepWithError(fields);
        if (at !== null) goTo(at);
      } else {
        setGeneral([e?.message ?? "No se pudo guardar el cliente"]);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", padding: SPACING.lg }]}>
        <Text style={{ color: COLORS.text, textAlign: "center", fontWeight: "700" }}>
          Su usuario no tiene permiso para registrar clientes.
        </Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: SPACING.xs }}>
          Pídale al administrador el permiso «clientes.insertar».
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
        <Text style={[styles.sub, { marginTop: SPACING.sm }]}>Cargando catálogos…</Text>
      </SafeAreaView>
    );
  }

  const municipalities = cat.municipalities.filter((m) => String(m.province_id) === String(form.province_id));
  const employee = Number(form.economic_activity) === 2;
  const last = step === STEPS.length - 1;

  const stepBody = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.card}>
            {text("customer_name", "Nombre y apellidos", { autoCapitalize: "words" })}
            {text("public_name", "Nombre conocido públicamente", { autoCapitalize: "words" })}
            {pick("genre_id", "Género", cat.genres)}
            {pick("marital_status_id", "Estado civil", cat.marital)}
            <Text style={styles.group}>Identificación</Text>
            {pick("identity_type", "Tipo de identificación", cat.docTypes)}
            {text("identification", "Número de identificación", {
              onChangeText: onIdentification,
              autoCapitalize: "characters",
              autoCorrect: false,
              maxLength: Number(form.identity_type) === CEDULA_TYPE_ID ? 14 : 30,
            })}
            {Number(form.identity_type) === CEDULA_TYPE_ID && (
              <HelperText type="info" visible>
                Cédula de 14 caracteres, sin guiones (p. ej. 0011501900002A). La fecha de nacimiento se toma de ella.
              </HelperText>
            )}
            {dateField("identity_issue_date", "Fecha de emisión", onIssueDate)}
            {dateField("identity_expiration_date", "Fecha de vencimiento")}
            {pick("identity_issue_country", "País de emisión", cat.countries)}
            <Text style={styles.group}>Nacimiento</Text>
            {dateField("birth_date", "Fecha de nacimiento", onBirthDate)}
            {text("age", "Edad", { editable: false })}
            {pick("birth_country_id", "País de nacimiento", cat.countries)}
            {pick("nationality_id", "Nacionalidad (país)", cat.countries)}
          </View>
        );
      case 1:
        return (
          <View style={styles.card}>
            {text("cellphone", "Celular", { keyboardType: "phone-pad" })}
            {text("telephone", "Teléfono fijo", { keyboardType: "phone-pad" })}
            {pick("residence_country_id", "País de residencia", cat.countries)}
            {pick("province_id", "Departamento", cat.provinces, { onChange: onProvince })}
            {pick("municipality_id", "Municipio", municipalities, { disabled: !form.province_id })}
            {!form.province_id && <HelperText type="info" visible>Elija primero el departamento.</HelperText>}
            {text("home_address", "Dirección del domicilio", { multiline: true })}
          </View>
        );
      case 2:
        return (
          <View style={styles.card}>
            <Text style={{ fontWeight: "700", color: COLORS.text }}>{label("Tipo de actividad", "economic_activity")}</Text>
            <View style={styles.chips}>
              <Chip selected={form.economic_activity === 1} onPress={() => onActivityType(1)}>Negocio propio</Chip>
              <Chip selected={form.economic_activity === 2} onPress={() => onActivityType(2)}>Empleado</Chip>
            </View>
            <HelperText type="error" visible={!!errors.economic_activity}>{errors.economic_activity}</HelperText>

            {activities
              ? pick("conami_id_actividad_economica", "Actividad económica", activities)
              : activitiesError
                ? <HelperText type="error" visible>{activitiesError}</HelperText>
                : <ActivityIndicator style={{ marginVertical: SPACING.sm }} />}

            {form.economic_activity != null && (employee ? (
              <>
                <Text style={styles.group}>Datos laborales</Text>
                {text("occupation", "Profesión u oficio")}
                {text("company", "Empresa")}
                {dateField("job_start_day", "Inicio en el trabajo")}
                {text("monthly_salary", "Salario mensual", { keyboardType: "decimal-pad" })}
                {text("job_telephone", "Teléfono del trabajo", { keyboardType: "phone-pad" })}
              </>
            ) : (
              <>
                <Text style={styles.group}>Datos del negocio</Text>
                {text("business_name", "Nombre del negocio", { autoCapitalize: "words" })}
                {pick("business_type_id", "Tipo de negocio", cat.businessTypes)}
                {text("business_address", "Dirección del negocio", { multiline: true })}
                {text("business_telephone", "Teléfono del negocio", { keyboardType: "phone-pad" })}
                {text("business_inventory", "Inventario (C$)", { keyboardType: "decimal-pad" })}
                {text("business_receivables", "Cuentas por cobrar (C$)", { keyboardType: "decimal-pad" })}
                {text("business_monthly_income", "Ingresos mensuales del negocio (C$)", { keyboardType: "decimal-pad" })}
              </>
            ))}
            {form.economic_activity != null && text("other_incomes", "Otros ingresos mensuales (C$)", { keyboardType: "decimal-pad" })}
          </View>
        );
      case 3:
        return (
          <View style={{ gap: SPACING.sm }}>
            {needsSpouse(form) && (
              <View style={styles.card}>
                <Text style={styles.group}>Cónyuge</Text>
                {text("spouse_name", "Nombre", { autoCapitalize: "words" })}
                {text("spouse_telephone", "Teléfono", { keyboardType: "phone-pad" })}
                {text("spouse_position", "Cargo u ocupación")}
                {text("spouse_address", "Dirección")}
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.group}>Referencia 1</Text>
              {text("reference_name", "Nombre", { autoCapitalize: "words" })}
              {text("reference_identity", "Identificación")}
              {text("reference_address", "Dirección")}
              {text("reference_workplace", "Centro laboral")}
              {text("reference_telephone", "Teléfono", { keyboardType: "phone-pad" })}
              {text("reference_relationship", "Parentesco o relación")}
              {text("reference_known_time", "Tiempo de conocerlo")}
            </View>
            <View style={styles.card}>
              <Text style={styles.group}>Referencia 2</Text>
              {text("reference2_name", "Nombre", { autoCapitalize: "words" })}
              {text("reference2_identity", "Identificación")}
              {text("reference2_address", "Dirección")}
              {text("reference2_workplace", "Centro laboral")}
              {text("reference2_telephone", "Teléfono", { keyboardType: "phone-pad" })}
              {text("reference2_relationship", "Parentesco o relación")}
              {text("reference2_known_time", "Tiempo de conocerlo")}
            </View>
          </View>
        );
      default:
        return (
          <View style={{ gap: SPACING.sm }}>
            {compliance && (
              <View style={styles.card}>
                <Text style={styles.group}>Cumplimiento (PLA/FT)</Text>
                {yesNo("is_pep", "¿Es una persona expuesta políticamente (PEP)?")}
                {form.is_pep === true && text("pep_details", "Cargo o relación con el cargo público", { multiline: true })}
                {text("funds_source", "Origen de los fondos")}
              </View>
            )}
            {branches.length > 1 && (
              <View style={styles.card}>
                <Text style={styles.group}>Sucursal</Text>
                {pick("branch_id", "Sucursal del cliente", branches.map((b) => ({ id: b.id, label: b.name || b.branch_name || `Sucursal ${b.id}` })))}
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.group}>Resumen</Text>
              <Text style={styles.summary}>{form.customer_name.trim() || "—"}</Text>
              <Text style={styles.sub}>Identificación: {form.identification.trim() || "—"}</Text>
              <Text style={styles.sub}>Celular: {form.cellphone.trim() || "—"}</Text>
              <Text style={styles.sub}>Domicilio: {form.home_address.trim() || "—"}</Text>
              <Text style={styles.sub}>
                Actividad: {form.economic_activity == null ? "—" : employee ? `Empleado${form.company ? ` (${form.company.trim()})` : ""}` : `Negocio propio${form.business_name ? ` (${form.business_name.trim()})` : ""}`}
              </Text>
            </View>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScroll key={step} contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.title}>{STEPS[step].title}</Text>
        <Text style={styles.sub}>Paso {step + 1} de {STEPS.length}{regulated ? "" : " · empresa no regulada: solo lo mínimo es obligatorio"}</Text>
        <View style={styles.bars}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={[styles.bar, i <= step && styles.barDone]} />
          ))}
        </View>

        {general.length > 0 && (
          <View style={styles.errBox}>
            {general.map((m, i) => (
              <Text key={i} style={{ color: COLORS.danger }}>{m}</Text>
            ))}
          </View>
        )}

        {stepBody()}

        <View style={styles.buttons}>
          {step > 0 && (
            <Button mode="outlined" onPress={() => goTo(step - 1)} disabled={saving} style={{ flex: 1, borderRadius: RADIUS.md }}>
              Atrás
            </Button>
          )}
          <Button
            mode="contained"
            onPress={last ? save : next}
            loading={saving}
            disabled={saving}
            style={{ flex: 1, borderRadius: RADIUS.md }}
          >
            {last ? "Guardar cliente" : "Siguiente"}
          </Button>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
