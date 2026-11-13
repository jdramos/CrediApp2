import React, { useContext, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, ActivityIndicator, HelperText, Chip } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { createCustomer, scanIdCard, getCustomer, updateCustomer } from "../api/customerApi";
import { getCustomFieldsForm } from "../api/loanFormApi";
import CustomFieldInputs from "../components/CustomFieldInputs";
import { fieldsInSection, validateCustomFieldValues, customFieldsPayload } from "../utils/customFields";
import { getSessionModules } from "../api/financeApi";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickImage } from "../utils/imagePicker";
import { setPickerContext, takeRecoveredPhoto } from "../utils/crashLog";
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
  STEPS, EMPTY_FORM, CEDULA_TYPE_ID, FIELD_INFO, needsSpouse, isRequired, validateForm,
  buildCustomerPayload, mapServerErrors, maskDate, addYears, ageFromBirth, birthFromCedula, normalizeCedula,
  formFromCustomer, CUSTOMER_TYPES,
} from "../utils/customerForm";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Sección de los campos personalizados (los define cada empresa en la web) -> paso del formulario.
const CUSTOM_SECTION_STEP = { general: 0, economic: 2, references: 3, additional: 4 };
const customStep = (field) => CUSTOM_SECTION_STEP[field.section] ?? 4;

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
// Con el parámetro customerId la misma pantalla edita la ficha de un cliente que ya existe (permiso clientes.editar):
// mismos pasos y campos que la web, sin borrador ni lectura de cédula ni cola sin señal, y guarda con PUT.
export default function NewCustomerScreen({ navigation, route }) {
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();
  const editId = route?.params?.customerId ?? null;
  const editing = editId != null;
  const canCreate = editing
    ? session?.permissions?.includes("clientes.editar")
    : session?.permissions?.includes("clientes.insertar");
  const regulated = session?.tenant?.conami_regulated !== false;
  const modules = session?.tenant?.enabled_modules;
  const compliance = !Array.isArray(modules) || modules.includes("compliance");
  const opts = useMemo(() => ({ regulated, compliance }), [regulated, compliance]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Edición: la ficha completa tal como la devolvió el servidor (se reenvía con lo editado encima).
  const [fullCustomer, setFullCustomer] = useState(null);
  const [loadError, setLoadError] = useState("");
  // Campos personalizados del cliente (Datos adicionales de la empresa).
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [customErrors, setCustomErrors] = useState({});
  const setCustom = (key, value) => {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
    setCustomErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const [cat, setCat] = useState(null); // catálogos principales
  const [catError, setCatError] = useState("");
  const [activities, setActivities] = useState(null);
  const [activitiesError, setActivitiesError] = useState("");
  const [branches, setBranches] = useState([]);

  // Lectura de la cédula con IA: complemento de pago que activa el superadmin por empresa.
  const [idScanEnabled, setIdScanEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { filled: [etiquetas], warnings: [] }
  const [scanError, setScanError] = useState("");
  useEffect(() => {
    if (!canCreate || editing) return;
    getSessionModules(session.token)
      .then((r) => setIdScanEnabled(r?.data?.id_scan_enabled === true))
      .catch(() => setIdScanEnabled(false)); // sin señal no se ofrece: la lectura la necesita
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate]);

  // Borrador (2026-11-11): si Android cierra la app mientras la cámara está abierta, lo digitado se pierde. Se guarda
  // en el teléfono mientras se llena y al volver a abrir la pantalla se ofrece continuarlo. Se borra al guardar.
  const draftKey = `CM_NEW_CUSTOMER_DRAFT_V1:${session?.user?.id ?? "x"}`;
  const [draftReady, setDraftReady] = useState(false);
  const hasContent = (f) => !!(String(f?.customer_name || "").trim() || String(f?.identification || "").trim() || String(f?.home_address || "").trim());
  const clearDraft = () => AsyncStorage.removeItem(draftKey).catch(() => {});

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

  // Campos personalizados de la empresa para clientes (y, al editar, los valores guardados de este cliente).
  useEffect(() => {
    if (!canCreate) return;
    getCustomFieldsForm(session.token, "CUSTOMER", editId)
      .then((r) => {
        const d = r?.data || {};
        setCustomFields(Array.isArray(d.fields) ? d.fields : []);
        if (editing && d.values && typeof d.values === "object") setCustomValues(d.values);
      })
      .catch(() => setCustomFields([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, editId]);

  // Edición: se trae la ficha y se llena el formulario (cuando ya están los catálogos).
  useEffect(() => {
    if (!canCreate || !editing || !cat) return;
    let alive = true;
    setLoadError("");
    getCustomer(session.token, editId)
      .then((res) => {
        const c = res?.data?.customer;
        if (!alive) return;
        if (!c) throw new Error("No se encontró el cliente");
        setFullCustomer(c);
        setForm(formFromCustomer(c));
      })
      .catch((e) => {
        if (alive) setLoadError(isNetworkError(e) ? "Sin conexión: editar la ficha necesita señal. Intente de nuevo cuando la tenga." : e?.message ?? "No se pudo cargar el cliente");
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, editing, editId, !!cat]);

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

  const askBack = () =>
    new Promise((resolve) => {
      Alert.alert(
        "Reverso de la cédula",
        "¿Quiere agregar también la foto del reverso? Ayuda a leer más datos.",
        [
          { text: "Solo el frente", onPress: () => resolve(false) },
          { text: "Agregar reverso", onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });

  // Fotografía la cédula, la manda a leer y llena el formulario (el cobrador revisa y corrige).
  // recovered: la foto del frente que se rescató si Android cerró la app con la cámara abierta.
  const scanCedula = async (recovered) => {
    if (scanning) return;
    setScanError("");
    setScanResult(null);
    try {
      setPickerContext("idscan-front");
      const front = recovered?.uri ? recovered : await pickImage();
      if (!front) return;
      let back = null;
      setPickerContext("idscan-back");
      if (await askBack()) back = await pickImage();
      setScanning(true);
      const res = await scanIdCard(session.token, { front, back });
      const f = res?.data?.fields || {};
      const filled = [];
      const genreId = f.sex
        ? (cat?.genres || []).find((g) => (f.sex === "M" ? /^(m|masc|hombre|varon)/i : /^(f|fem|mujer)/i).test(String(g.label || "").trim()))?.id
        : null;
      setForm((prev) => {
        const next = { ...prev };
        if (f.customer_name) { next.customer_name = f.customer_name; filled.push("nombre"); }
        if (f.identification) {
          next.identity_type = CEDULA_TYPE_ID;
          next.identification = normalizeCedula(f.identification);
          filled.push("cédula");
        }
        if (f.birth_date) { next.birth_date = f.birth_date; next.age = ageFromBirth(f.birth_date); filled.push("nacimiento"); }
        if (f.identity_issue_date) { next.identity_issue_date = f.identity_issue_date; filled.push("emisión"); }
        if (f.identity_expiration_date) { next.identity_expiration_date = f.identity_expiration_date; filled.push("vencimiento"); }
        if (genreId != null) { next.genre_id = genreId; filled.push("género"); }
        if (f.home_address && !String(prev.home_address || "").trim()) { next.home_address = f.home_address; filled.push("dirección"); }
        return next;
      });
      setErrors((prev) => ({ ...prev, customer_name: undefined, identification: undefined, birth_date: undefined, age: undefined, identity_issue_date: undefined, identity_expiration_date: undefined, genre_id: undefined }));
      setScanResult({ filled, warnings: res?.data?.warnings || [] });
    } catch (e) {
      setScanError(
        isNetworkError(e)
          ? "Sin señal: la lectura de la cédula necesita conexión. Digite los datos a mano."
          : e?.message || "No se pudo leer la cédula. Intente de nuevo o digite los datos.",
      );
    } finally {
      setPickerContext(null);
      setScanning(false);
    }
  };

  // Al tener los catálogos: ofrece continuar el borrador y, si la app se cerró con la cámara abierta, usar la foto rescatada.
  useEffect(() => {
    if (!canCreate || editing || !cat || draftReady) return undefined;
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        const draft = raw ? JSON.parse(raw) : null;
        if (alive && draft?.form && hasContent(draft.form) && Date.now() - Number(draft.savedAt || 0) < 48 * 3600 * 1000) {
          const keep = await new Promise((resolve) => {
            Alert.alert(
              "Cliente a medias",
              `Quedó sin guardar el registro de ${String(draft.form.customer_name || draft.form.identification || "un cliente").trim()}. ¿Quiere continuarlo?`,
              [
                { text: "Empezar de nuevo", style: "destructive", onPress: () => resolve(false) },
                { text: "Continuar", onPress: () => resolve(true) },
              ],
              { cancelable: false },
            );
          });
          if (!alive) return;
          if (keep) {
            setForm((prev) => ({ ...prev, ...draft.form }));
            if (draft.custom && typeof draft.custom === "object") setCustomValues(draft.custom);
            setStep(Math.min(Math.max(Number(draft.step) || 0, 0), STEPS.length - 1));
          } else {
            await clearDraft();
          }
        }
      } catch {
        // un borrador dañado no debe impedir registrar clientes
      }
      if (alive) setDraftReady(true);
      try {
        const photo = await takeRecoveredPhoto("idscan-front");
        if (alive && photo) {
          Alert.alert(
            "Foto recuperada",
            "La app se cerró mientras tomaba la foto de la cédula, pero la foto se alcanzó a guardar. ¿Leer los datos con ella?",
            [
              { text: "No", style: "cancel" },
              { text: "Leer la cédula", onPress: () => scanCedula(photo) },
            ],
          );
        }
      } catch {
        // sin foto rescatada
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreate, cat]);

  // Guarda el borrador mientras se llena (sin esperar a que se cierre la app).
  useEffect(() => {
    if (editing || !draftReady || !hasContent(form)) return undefined;
    const t = setTimeout(() => {
      AsyncStorage.setItem(draftKey, JSON.stringify({ form, custom: customValues, step, savedAt: Date.now() })).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, customValues, step, draftReady]);

  const onProvince = (id) => {
    setForm((prev) => ({ ...prev, province_id: id, municipality_id: null }));
    setErrors((prev) => ({ ...prev, province_id: undefined, municipality_id: undefined }));
  };

  const onActivityType = (value) => {
    setForm((prev) => ({ ...prev, economic_activity: value }));
    setErrors((prev) => ({ ...prev, economic_activity: undefined }));
  };

  useEffect(() => {
    if (editing) navigation.setOptions?.({ title: "Editar cliente" });
  }, [editing, navigation]);

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
    business_license_issued: { minYear: 1990, maxYear: thisYear },
    business_license_expiry: { minYear: thisYear - 5, maxYear: thisYear + 30 },
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

  // Campos personalizados de la empresa: los obligatorios deben estar llenos (de un paso, o de todos).
  const customFieldErrors = (onlyStep = null) =>
    validateCustomFieldValues(customFields.filter((f) => onlyStep === null || customStep(f) === onlyStep), customValues);
  const customBody = () => (customFields.length ? { custom_fields: customFieldsPayload(customFields, customValues) } : {});

  const next = () => {
    const found = validateForm(form, opts, step);
    const customFound = customFieldErrors(step);
    setGeneral([]);
    if (Object.keys(found).length || Object.keys(customFound).length) {
      setErrors((prev) => ({ ...prev, ...found }));
      setCustomErrors((prev) => ({ ...prev, ...customFound }));
      setGeneral(["Revise los campos marcados en rojo."]);
      return;
    }
    goTo(step + 1);
  };

  const save = () => {
    const found = validateForm(form, opts);
    const customFound = customFieldErrors();
    setGeneral([]);
    if (Object.keys(found).length || Object.keys(customFound).length) {
      setErrors(found);
      setCustomErrors(customFound);
      const customSteps = customFields.filter((f) => customFound[f.field_key]).map(customStep);
      const steps = [
        ...Object.keys(found).map((f) => (FIELD_INFO[f] ? FIELD_INFO[f][0] : 4)),
        ...customSteps,
      ];
      const at = steps.length ? Math.min(...steps) : null;
      setGeneral([`Faltan datos en: ${[...new Set(steps)].sort().map((i) => STEPS[i].title).join(", ")}.`]);
      if (at !== null && at !== step) goTo(at);
      return;
    }
    confirmAction(
      editing ? "Guardar cambios" : "Guardar cliente",
      editing
        ? `Se actualizará la ficha de ${form.customer_name.trim()} (${form.identification.trim()}).`
        : `Se registrará a ${form.customer_name.trim()} (${form.identification.trim()}).`,
      editing ? doUpdate : doSave,
      { confirmText: "Guardar" },
    );
  };

  // Errores que devuelve el servidor (400): los de un campo van al campo; los de campos personalizados, a su campo.
  const applyServerErrors = (list) => {
    const customOnes = {};
    const rest = [];
    (Array.isArray(list) ? list : []).forEach((e) => {
      const m = /^custom_fields\.(.+)$/.exec(String(e?.field || ""));
      if (m) customOnes[m[1]] = e.message || "Dato no válido";
      else rest.push(e);
    });
    const { fields, general: other } = mapServerErrors(rest);
    setErrors((prev) => ({ ...prev, ...fields }));
    setCustomErrors((prev) => ({ ...prev, ...customOnes }));
    const customLabels = Object.entries(customOnes).map(([k, m]) => `${customFields.find((f) => f.field_key === k)?.label || k}: ${m}`);
    setGeneral([...Object.entries(fields).map(([f, m]) => `${FIELD_INFO[f][1]}: ${m}`), ...customLabels, ...other]);
    const steps = [
      ...Object.keys(fields).map((f) => FIELD_INFO[f][0]),
      ...customFields.filter((f) => customOnes[f.field_key]).map(customStep),
    ];
    if (steps.length) goTo(Math.min(...steps));
  };

  // Edición de la ficha: se manda la ficha completa del servidor con lo editado encima (el PUT reemplaza todas las
  // columnas). La actualización de la sucursal, de la garantía y del PEP no pasa por aquí.
  const doUpdate = async () => {
    if (saving) return;
    try {
      setSaving(true);
      setGeneral([]);
      const { customer } = buildCustomerPayload(form);
      await updateCustomer(session.token, editId, { customer: { ...fullCustomer, ...customer }, ...customBody() });
      Alert.alert("Ficha actualizada", "Los cambios del cliente quedaron guardados.");
      navigation.goBack();
    } catch (e) {
      if (isNetworkError(e)) {
        setGeneral(["Sin conexión: editar la ficha necesita señal. Intente de nuevo cuando la tenga."]);
      } else if (e?.status === 409) {
        setErrors((prev) => ({ ...prev, identification: "Ya existe un cliente con esa identificación" }));
        setGeneral([e?.data?.errors?.[0]?.message || "Ya existe un cliente con esa identificación."]);
        goTo(0);
      } else if (e?.status === 400 && Array.isArray(e?.data?.errors)) {
        applyServerErrors(e.data.errors);
      } else {
        setGeneral([e?.message ?? "No se pudo guardar la ficha"]);
      }
    } finally {
      setSaving(false);
    }
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
        payload: { localId, body: { ...buildCustomerPayload(form), ...customBody(), prospect_request: true } },
      });
      refreshPendingCount();
      await clearDraft();
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
      const res = await createCustomer(session.token, { ...buildCustomerPayload(form), ...customBody(), prospect_request: true });
      const id = res?.data?.id ?? res?.id;
      await clearDraft();
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
        applyServerErrors(e.data.errors);
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
          {editing ? "Su usuario no tiene permiso para editar clientes." : "Su usuario no tiene permiso para registrar clientes."}
        </Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: SPACING.xs }}>
          Pídale al administrador el permiso «{editing ? "clientes.editar" : "clientes.insertar"}».
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

  if (editing && !fullCustomer) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center", padding: SPACING.lg }]}>
        {loadError ? (
          <>
            <Text style={{ color: COLORS.danger, textAlign: "center" }}>{loadError}</Text>
            <Button mode="contained" onPress={() => navigation.goBack()} style={{ marginTop: SPACING.md }}>Volver</Button>
          </>
        ) : (
          <>
            <ActivityIndicator />
            <Text style={[styles.sub, { marginTop: SPACING.sm }]}>Cargando la ficha…</Text>
          </>
        )}
      </SafeAreaView>
    );
  }

  // Campos personalizados de la empresa que van en este paso.
  const customSection = (section) =>
    fieldsInSection(customFields, section).length > 0 ? (
      <View style={styles.card}>
        <CustomFieldInputs
          fields={customFields}
          section={section}
          values={customValues}
          errors={customErrors}
          onChange={setCustom}
          title="Datos adicionales de la empresa"
        />
      </View>
    ) : null;

  const municipalities = cat.municipalities.filter((m) => String(m.province_id) === String(form.province_id));
  const employee = Number(form.economic_activity) === 2;
  const last = step === STEPS.length - 1;

  const stepBody = () => {
    switch (step) {
      case 0:
        return (
          <View style={{ gap: SPACING.sm }}>
          <View style={styles.card}>
            {idScanEnabled && !editing && (
              <View style={{ gap: SPACING.xs, marginBottom: SPACING.sm }}>
                <Button
                  mode="contained-tonal"
                  icon="card-account-details-outline"
                  onPress={() => scanCedula()}
                  loading={scanning}
                  disabled={scanning}
                  style={{ borderRadius: RADIUS.md }}
                >
                  {scanning ? "Leyendo la cédula…" : "Leer la cédula con la cámara"}
                </Button>
                {!!scanError && <HelperText type="error" visible>{scanError}</HelperText>}
                {!!scanResult && (
                  <View>
                    <Text style={{ color: COLORS.success, fontWeight: "700" }}>
                      {scanResult.filled.length
                        ? `Se llenó: ${scanResult.filled.join(", ")}. Revise que todo coincida con la cédula.`
                        : "No se pudo leer ningún dato. Intente con otra foto o digite a mano."}
                    </Text>
                    {scanResult.warnings.map((w) => (
                      <Text key={w} style={{ color: COLORS.warning, fontWeight: "600", fontSize: 12 }}>• {w}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}
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
            {pick("customer_type", "Tipo de cliente", CUSTOMER_TYPES)}
            <HelperText type="info" visible>Fiador o Ambos permite elegir a esta persona como fiador de un crédito.</HelperText>
          </View>
          {customSection("general")}
          </View>
        );
      case 1:
        return (
          <View style={styles.card}>
            {text("cellphone", "Celular", { keyboardType: "phone-pad" })}
            {text("telephone", "Teléfono fijo", { keyboardType: "phone-pad" })}
            {text("email", "Correo electrónico", { keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false })}
            {pick("residence_country_id", "País de residencia", cat.countries)}
            {pick("province_id", "Departamento", cat.provinces, { onChange: onProvince })}
            {pick("municipality_id", "Municipio", municipalities, { disabled: !form.province_id })}
            {!form.province_id && <HelperText type="info" visible>Elija primero el departamento.</HelperText>}
            {text("home_address", "Dirección del domicilio", { multiline: true })}
          </View>
        );
      case 2:
        return (
          <View style={{ gap: SPACING.sm }}>
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
                <Text style={styles.group}>Permisos y licencias (opcional)</Text>
                {text("business_license_entity", "Entidad emisora")}
                {dateField("business_license_issued", "Fecha de emisión")}
                {dateField("business_license_expiry", "Fecha de vencimiento")}
              </>
            ))}
            {form.economic_activity != null && text("other_incomes", "Otros ingresos mensuales (C$)", { keyboardType: "decimal-pad" })}
          </View>
          {customSection("economic")}
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
                <Text style={styles.group}>Trabajo del cónyuge</Text>
                {text("spouse_job_company", "Empresa donde labora")}
                {text("spouse_job_telephone", "Teléfono del trabajo", { keyboardType: "phone-pad" })}
                {text("spouse_job_salary", "Salario mensual (C$)", { keyboardType: "decimal-pad" })}
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
            {customSection("references")}
          </View>
        );
      default:
        return (
          <View style={{ gap: SPACING.sm }}>
            {compliance && !editing && (
              <View style={styles.card}>
                <Text style={styles.group}>Cumplimiento (PLA/FT)</Text>
                {yesNo("is_pep", "¿Es una persona expuesta políticamente (PEP)?")}
                {form.is_pep === true && text("pep_details", "Cargo o relación con el cargo público", { multiline: true })}
                {text("funds_source", "Origen de los fondos")}
              </View>
            )}
            {branches.length > 1 && !editing && (
              <View style={styles.card}>
                <Text style={styles.group}>Sucursal</Text>
                {pick("branch_id", "Sucursal del cliente", branches.map((b) => ({ id: b.id, label: b.name || b.branch_name || `Sucursal ${b.id}` })))}
              </View>
            )}
            {customSection("additional")}
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
            {last ? (editing ? "Guardar cambios" : "Guardar cliente") : "Siguiente"}
          </Button>
        </View>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
