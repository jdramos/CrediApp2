import React, { useContext, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Card, Button, Chip, ActivityIndicator, HelperText, IconButton, Checkbox, Portal, Modal } from "react-native-paper";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SessionContext } from "../auth/SessionContext";
import { searchCustomers, getCustomer, saveCustomerGuarantees } from "../api/customerApi";
import { getAccessibleBranches } from "../api/branchApi";
import { createLoanRequest } from "../api/loanApi";
import { getLoanCatalogs } from "../api/conamiApi";
import { getFrecuencies } from "../api/frecuencyApi";
import { getPromotersByBranch } from "../api/promoterApi";
import { getCollectorsByBranch } from "../api/collectorApi";
import { getCustomerGuarantees } from "../api/guaranteesApi";
import { uploadGuaranteePhoto } from "../api/guaranteePhotoApi";
import { getCustomerChecklist, uploadCustomerDocument } from "../api/customerDocumentApi";
import { getCurrentEvaluation } from "../api/customerEvaluationApi";
import { getCreditPolicies } from "../api/creditPolicyApi";
import CatalogPickerField from "../components/CatalogPickerField";
import { pickImage } from "../utils/imagePicker";
import { isNetworkError } from "../api/credimasterClient";
import { persistLocalFile } from "../offline/filePersist";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import { useBusinessDayStatus } from "../hooks/useBusinessDayStatus";
import BusinessDayBanner from "../components/BusinessDayBanner";
import { confirmAction } from "../utils/confirm";
import { money, toNumber, formatAmountInput } from "../utils/format";
import { todayISO } from "../utils/date";
import { COLORS } from "../theme/colors";
import CopyableId from "../components/CopyableId";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";

const STEPS = ["Cliente", "Crédito", "Garantías", "Confirmar", "Listo"];

// Los 11 catálogos "complementarios" del crédito (igual que el
// acordeón "Datos complementarios del crédito" en la web). id_garantia
// NO está acá: se deriva de si el usuario eligió garantías (paso 2),
// igual que hace la web (useLoanForm.js), no es un select libre.
const COMPLEMENTARY_FIELDS = [
  { key: "id_tipo_credito", label: "Tipo de crédito", catalogKey: "tiposCredito" },
  { key: "id_destino_credito", label: "Destino del crédito", catalogKey: "destinosCredito", labelField: "description" },
  { key: "id_linea", label: "Línea", catalogKey: "lineas" },
  { key: "id_modalidad_credito", label: "Modalidad de crédito", catalogKey: "modalidadesCredito" },
  { key: "id_moneda", label: "Moneda", catalogKey: "monedas" },
  { key: "id_origen_recursos", label: "Origen de recursos", catalogKey: "origenesRecursos" },
  { key: "id_sindicado", label: "Sindicado", catalogKey: "sindicados" },
  { key: "id_tipo_agrupacion_credito", label: "Tipo de agrupación", catalogKey: "tiposAgrupacionCredito" },
  { key: "id_sector_economico", label: "Sector económico", catalogKey: "sectoresEconomicos" },
  { key: "id_met_atencion", label: "Método de atención", catalogKey: "metodosAtencion" },
  { key: "id_tipo_zona", label: "Tipo de zona", catalogKey: "tiposZona" },
];

const isDefaultRow = (row) => row?.is_default === 1 || row?.is_default === "1" || row?.is_default === "Y";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  header: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2 },
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
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  cardTitle: { fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs },
  successWrap: { alignItems: "center", justifyContent: "center", flex: 1, gap: SPACING.md, padding: SPACING.xl },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
});

function StepHeader({ step, onBack, title }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm }}>
      {onBack && <IconButton icon="arrow-left" onPress={onBack} style={{ margin: 0 }} />}
      <View style={{ flex: 1 }}>
        <Text variant="headlineSmall" style={styles.header}>{title}</Text>
        <Text style={styles.sub}>Paso {step + 1} de {STEPS.length}: {STEPS[step]}</Text>
      </View>
    </View>
  );
}

const money2 = (n) => (n ? money(n) : null);

export default function NewLoanRequestScreen({ route, navigation }) {
  // Datos que trae el simulador de crédito (opcional): precargan el paso del crédito.
  const sim = route?.params?.sim;
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();
  const [step, setStep] = useState(0);

  // Cliente
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState(null);

  // Catálogos
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(null);
  const businessDayStatus = useBusinessDayStatus(session.token, branchId, session?.user?.branches);
  const [frecuencies, setFrecuencies] = useState([]);
  const [loanCatalogs, setLoanCatalogs] = useState({});
  const [promoters, setPromoters] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [guarantees, setGuarantees] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [policies, setPolicies] = useState({});

  // Datos del crédito
  const [amount, setAmount] = useState(sim?.amount ? formatAmountInput(String(sim.amount)) : "");
  const [term, setTerm] = useState(sim?.term ? String(sim.term) : "");
  const [frequencyId, setFrequencyId] = useState(sim?.frequencyId ?? null);
  const [requestDate, setRequestDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [showDate, setShowDate] = useState(null); // "request" | "due" | null
  const [interestRate, setInterestRate] = useState(sim?.interestRate ? String(sim.interestRate) : "");
  const [defaultedRate, setDefaultedRate] = useState("");
  const [fee, setFee] = useState(sim?.fee ? formatAmountInput(String(sim.fee)) : "");
  const [insurance, setInsurance] = useState(sim?.insurance ? formatAmountInput(String(sim.insurance)) : "");
  const [otherCharges, setOtherCharges] = useState(sim?.otherCharges ? formatAmountInput(String(sim.otherCharges)) : "");
  const [deduction, setDeduction] = useState("");
  const [promoterId, setPromoterId] = useState(null);
  const [vendorId, setVendorId] = useState(null);
  const [showExtra, setShowExtra] = useState(false);
  const [extra, setExtra] = useState({});

  // Garantías
  const [selectedGuaranteeIds, setSelectedGuaranteeIds] = useState([]);
  const [showAddGuarantee, setShowAddGuarantee] = useState(false);
  const [newArticle, setNewArticle] = useState("");
  const [newSeries, setNewSeries] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newValue, setNewValue] = useState("");
  const [savingGuarantee, setSavingGuarantee] = useState(false);
  const [uploadingGuaranteeId, setUploadingGuaranteeId] = useState(null);

  // Documentos del cliente
  const [checklist, setChecklist] = useState([]);
  const [uploadingCode, setUploadingCode] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getAccessibleBranches(session.token);
        const list = res?.data || [];
        setBranches(list);
        if (list[0]) setBranchId(list[0].id);
      } catch (e) {
        setError(e?.message ?? "Error cargando sucursales");
      }
    })();

    // Best-effort: estos catálogos requieren permisos aparte
    // (catalogos.ver) — si el usuario no los tiene, el picker
    // correspondiente simplemente no aparece.
    getFrecuencies(session.token).then((rows) => setFrecuencies(rows || [])).catch(() => {});
    getLoanCatalogs(session.token).then((data) => setLoanCatalogs(data || {})).catch(() => {});
    getCreditPolicies(session.token)
      .then((rows) => {
        const map = {};
        (rows || []).forEach((p) => { map[p.policy_key] = p.policy_value; });
        setPolicies(map);
      })
      .catch(() => {});
  }, [session.token]);

  useEffect(() => {
    if (!branchId) return;
    getPromotersByBranch(session.token, branchId).then((rows) => setPromoters(rows || [])).catch(() => setPromoters([]));
    getCollectorsByBranch(session.token, branchId).then((rows) => setCollectors(rows || [])).catch(() => setCollectors([]));
  }, [branchId, session.token]);

  useEffect(() => {
    if (!customer?.id) return;
    getCurrentEvaluation(session.token, customer.id).then(setEvaluation).catch(() => setEvaluation(null));
    getCustomerGuarantees(session.token, customer.id).then((rows) => setGuarantees(rows || [])).catch(() => setGuarantees([]));
    getCustomerChecklist(session.token, customer.id).then((rows) => setChecklist(Array.isArray(rows) ? rows : [])).catch(() => setChecklist([]));
  }, [customer?.id, session.token]);

  // Prellena los catálogos complementarios con la fila "por defecto" del
  // tenant, igual que la web — el usuario puede cambiarlos con el picker.
  useEffect(() => {
    if (!loanCatalogs || Object.keys(loanCatalogs).length === 0) return;
    setExtra((prev) => {
      const next = { ...prev };
      COMPLEMENTARY_FIELDS.forEach(({ key, catalogKey }) => {
        if (key === "id_destino_credito") return; // se prellena desde el cliente, ver pickCustomer
        if (next[key] != null) return;
        const rows = loanCatalogs[catalogKey] || [];
        const def = rows.find(isDefaultRow);
        if (def) next[key] = def.id;
      });
      return next;
    });
  }, [loanCatalogs]);

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

  const pickCustomer = (c) => {
    setCustomer(c);
    setError("");
    setStep(1);
    if (c.conami_id_actividad_economica) {
      setExtra((prev) => ({ ...prev, id_destino_credito: c.conami_id_actividad_economica }));
    }
  };

  const reset = () => {
    setStep(0);
    setQuery("");
    setResults([]);
    setCustomer(null);
    setAmount("");
    setTerm("");
    setFrequencyId(null);
    setRequestDate(todayISO());
    setDueDate(todayISO());
    setInterestRate("");
    setDefaultedRate("");
    setFee("");
    setInsurance("");
    setOtherCharges("");
    setDeduction("");
    setPromoterId(null);
    setVendorId(null);
    setExtra({});
    setShowExtra(false);
    setSelectedGuaranteeIds([]);
    setGuarantees([]);
    setChecklist([]);
    setShowAddGuarantee(false);
    setNewArticle(""); setNewSeries(""); setNewBrand(""); setNewValue("");
    setEvaluation(null);
    setResult(null);
    setError("");
  };

  const selectedFrequency = frecuencies.find((f) => String(f.id) === String(frequencyId));
  const selectedPromoter = promoters.find((p) => String(p.id) === String(promoterId));
  const availableGuarantees = guarantees.filter((g) => !g.is_committed);

  const toggleGuarantee = (id) => {
    setSelectedGuaranteeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canEditCustomer = session?.permissions?.includes("clientes.editar");
  const canPhotoGuarantee = session?.permissions?.includes("garantias.insertar");
  const canUploadDocs = session?.permissions?.includes("clientes.documentos.subir");

  const saveGuarantee = async () => {
    try {
      setSavingGuarantee(true);
      setError("");
      const fullCustomerRes = await getCustomer(session.token, customer.id);
      const fullCustomer = fullCustomerRes?.data?.customer;
      const existingPayload = guarantees.map((g) => ({
        id: g.id, article: g.article, series: g.series, brand: g.brand, value: g.value,
      }));
      const newPayload = {
        article: newArticle.trim() || null,
        series: newSeries.trim() || null,
        brand: newBrand.trim() || null,
        value: toNumber(newValue) || null,
      };
      await saveCustomerGuarantees(session.token, customer.id, fullCustomer, [...existingPayload, newPayload]);
      const rows = await getCustomerGuarantees(session.token, customer.id);
      setGuarantees(rows || []);
      setNewArticle(""); setNewSeries(""); setNewBrand(""); setNewValue("");
      setShowAddGuarantee(false);
    } catch (e) {
      setError(e?.message ?? "No se pudo agregar la garantía");
    } finally {
      setSavingGuarantee(false);
    }
  };

  const addGuarantee = () => {
    if (!newArticle.trim() && !newBrand.trim() && !toNumber(newValue)) {
      setError("Ingresá al menos el artículo o el valor de la garantía");
      return;
    }
    confirmAction(
      "Agregar garantía",
      `¿Guardar "${newArticle.trim() || newBrand.trim() || "esta garantía"}" en el expediente del cliente?`,
      saveGuarantee,
    );
  };

  const captureGuaranteePhoto = async (guaranteeId) => {
    let file;
    try {
      file = await pickImage();
    } catch (e) {
      setError(e?.message ?? "No se pudo abrir la cámara/galería");
      return;
    }
    if (!file) return;

    setUploadingGuaranteeId(guaranteeId);
    setError("");
    try {
      await uploadGuaranteePhoto(session.token, guaranteeId, file);
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          const stableUri = await persistLocalFile(file.uri, file.name);
          await enqueue({
            type: "GUARANTEE_PHOTO",
            label: `Foto de garantía #${guaranteeId}`,
            payload: { guaranteeId, file: { ...file, uri: stableUri } },
          });
          refreshPendingCount();
          Alert.alert("Sin conexión", "La foto se guardó en el equipo y se subirá sola cuando vuelva la señal.");
        } catch (queueErr) {
          setError(queueErr?.message ?? "No se pudo guardar la foto para enviarla después");
        }
      } else {
        setError(e?.message ?? "No se pudo subir la foto de la garantía");
      }
    } finally {
      setUploadingGuaranteeId(null);
    }
  };

  const captureDocument = async (item) => {
    let file;
    try {
      file = await pickImage();
    } catch (e) {
      setError(e?.message ?? "No se pudo abrir la cámara/galería");
      return;
    }
    if (!file) return;

    setUploadingCode(item.code);
    setError("");
    try {
      await uploadCustomerDocument(session.token, customer.id, file, {
        docType: "OTRO",
        docName: item.title,
        relatedItemCode: item.code,
      });
      const rows = await getCustomerChecklist(session.token, customer.id);
      setChecklist(Array.isArray(rows) ? rows : []);
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          const stableUri = await persistLocalFile(file.uri, file.name);
          await enqueue({
            type: "CUSTOMER_DOCUMENT",
            label: `Documento: ${item.title}`,
            payload: {
              customerId: customer.id,
              file: { ...file, uri: stableUri },
              options: { docType: "OTRO", docName: item.title, relatedItemCode: item.code },
            },
          });
          refreshPendingCount();
          Alert.alert("Sin conexión", "El documento se guardó en el equipo y se subirá solo cuando vuelva la señal.");
        } catch (queueErr) {
          setError(queueErr?.message ?? "No se pudo guardar el documento para enviarlo después");
        }
      } else {
        setError(e?.message ?? "No se pudo subir el documento");
      }
    } finally {
      setUploadingCode(null);
    }
  };

  // getPolicy(key) === undefined cuando la política no está configurada
  // en el tenant — en ese caso el límite correspondiente simplemente no
  // se exige (mismo criterio que la web, useLoanForm.js::getPolicy).
  const getPolicy = (key) => policies[key];

  const validateStep1 = () => {
    const amt = toNumber(amount);
    const trm = Number(term);
    if (!branchId) return "Seleccione una sucursal";
    if (!amt || amt <= 0) return "Ingrese un monto válido";
    if (!trm || trm <= 0) return "Ingrese un plazo válido";
    if (frecuencies.length > 0 && !frequencyId) return "Seleccione la frecuencia de pago";
    if (!interestRate || Number(interestRate) <= 0) return "Ingrese la tasa de interés";
    if (selectedFrequency?.tag === "V" && !dueDate) return "Ingrese la fecha de vencimiento";

    // Políticas de crédito (igual que la web, useLoanForm.js::validateForm)
    if (getPolicy("max_amount") && amt > Number(getPolicy("max_amount"))) {
      return `El monto excede el máximo permitido: C$${getPolicy("max_amount")}`;
    }
    if (getPolicy("min_amount") && amt < Number(getPolicy("min_amount"))) {
      return `El monto es menor al mínimo permitido: C$${getPolicy("min_amount")}`;
    }
    if (getPolicy("max_term_months") && trm > Number(getPolicy("max_term_months"))) {
      return `El plazo excede el máximo permitido: ${getPolicy("max_term_months")} meses`;
    }
    if (getPolicy("min_term_months") && trm < Number(getPolicy("min_term_months"))) {
      return `El plazo es menor al mínimo permitido: ${getPolicy("min_term_months")} meses`;
    }
    if (getPolicy("max_interest_rate") && Number(interestRate) * 12 > Number(getPolicy("max_interest_rate"))) {
      return `La tasa anual excede lo permitido: ${getPolicy("max_interest_rate")}%`;
    }
    if (getPolicy("min_interest_rate") && Number(interestRate) < Number(getPolicy("min_interest_rate"))) {
      return `La tasa de interés es menor al mínimo permitido: ${getPolicy("min_interest_rate")}%`;
    }
    if (defaultedRate && getPolicy("max_defaulted_rate") && Number(defaultedRate) > Number(getPolicy("max_defaulted_rate"))) {
      return `La tasa de mora excede el máximo permitido: ${getPolicy("max_defaulted_rate")}%`;
    }
    if (defaultedRate && getPolicy("max_late_interest_rate") && Number(defaultedRate) > Number(interestRate) / 4) {
      return "La tasa de mora excede el máximo permitido";
    }
    return "";
  };

  // Cobertura mínima de garantía — solo se puede evaluar después del
  // paso de Garantías (paso 2), por eso vive aparte de validateStep1.
  const validateCollateralCoverage = () => {
    const minCoverage = getPolicy("min_collateral_coverage");
    if (!minCoverage) return "";
    const selectedValue = guarantees
      .filter((g) => selectedGuaranteeIds.includes(g.id))
      .reduce((sum, g) => sum + Number(g.available_value ?? g.value ?? 0), 0);
    if (selectedValue <= 0) return "";
    const coveragePct = (selectedValue / toNumber(amount)) * 100;
    if (coveragePct < Number(minCoverage)) {
      return `Las garantías seleccionadas no cubren el ${minCoverage}% mínimo requerido del monto del crédito`;
    }
    return "";
  };

  const submitLoanRequest = async () => {
    const payload = {
      customer_id: customer.id,
      customer_identification: customer.identification,
      requestDate,
      source: "MOBILE",
      vendor_id: vendorId || null,
      promoter_id: promoterId || null,
      amount: toNumber(amount),
      fee: toNumber(fee) || 0,
      deduction: toNumber(deduction) || 0,
      term: Number(term),
      due_date: selectedFrequency?.tag === "V" ? dueDate : null,
      interest_type_id: 1,
      interest_type_name: "compound",
      interest_rate: interestRate ? Number(interestRate) : 0,
      defaulted_rate: defaultedRate ? Number(defaultedRate) : 0,
      insurance: toNumber(insurance) || 0,
      other_charges: toNumber(otherCharges) || 0,
      frequency_id: selectedFrequency?.tag || null,
      branch_id: branchId,
      credit_evaluation_id: evaluation?.id || null,
      id_periodo_cobro_interes: selectedFrequency?.id || null,
      id_periodo_cobro_principal: selectedFrequency?.id || null,
      id_oficina: branchId,
      id_analista: selectedPromoter?.identification || null,
      id_garantia: selectedGuaranteeIds.length > 0 ? "1" : "0",
      id_situacion_credito: 1,
      id_estado_credito: 1,
      guarantee_ids: selectedGuaranteeIds,
      ...extra,
    };

    try {
      setSaving(true);
      const res = await createLoanRequest(session.token, payload);
      setResult(res);
      setStep(4);
    } catch (e) {
      const data = e?.data;
      if (data?.code === "COLLATERAL_INSUFFICIENT") {
        setError("La garantía seleccionada no cubre el mínimo requerido para este monto. Agregá más garantías o consultá a tu supervisor.");
      } else if (Array.isArray(data?.missing_documents) && data.missing_documents.length > 0) {
        const list = data.missing_documents.map((d) => d.title || d.code).join(", ");
        setError(`El expediente del cliente está incompleto. Faltan: ${list}`);
      } else if (e?.status === 423) {
        setError(data?.message || "El día operativo de la sucursal no está abierto todavía.");
      } else {
        setError(e?.message ?? "No se pudo crear la solicitud");
      }
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    setError("");
    const validation = validateStep1() || validateCollateralCoverage();
    if (validation) {
      setError(validation);
      return;
    }
    confirmAction(
      "Enviar solicitud",
      `¿Confirmás enviar la solicitud de ${money(toNumber(amount))} para ${customer?.customer_name}?`,
      submitLoanRequest,
    );
  };

  const canCreate = session?.permissions?.includes("creditos.insertar");
  if (!canCreate) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: "center", justifyContent: "center", padding: SPACING.xl }]}>
        <MaterialCommunityIcons name="lock-outline" size={48} color={COLORS.muted} />
        <Text style={{ marginTop: SPACING.md, color: COLORS.muted, textAlign: "center" }}>
          No tenés permiso para crear solicitudes de crédito.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAwareScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            <StepHeader
              step={0}
              title="Nueva solicitud"
              onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("CreditsHome"))}
            />
            <Text style={styles.sub}>Buscá el cliente para el que vas a registrar la solicitud</Text>
            <TextInput
              mode="outlined"
              label="Nombre o cédula"
              value={query}
              onChangeText={onSearchChange}
              autoCapitalize="none"
              style={{ backgroundColor: COLORS.card, marginTop: SPACING.md }}
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
                  <CopyableId label="Cédula: " value={item.identification} textStyle={styles.muted} />
                </Card>
              )}
            />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View entering={FadeInDown} exiting={FadeOut}>
            <StepHeader step={1} title={customer?.customer_name} onBack={() => setStep(0)} />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sucursal</Text>
              <View style={styles.chipsRow}>
                {branches.map((b) => (
                  <Chip
                    key={b.id}
                    selected={branchId === b.id}
                    onPress={() => setBranchId(b.id)}
                    style={{ backgroundColor: branchId === b.id ? COLORS.primarySoft : COLORS.bg }}
                  >
                    {b.name}
                  </Chip>
                ))}
              </View>
              {evaluation?.id && (
                <Chip icon="chart-line" style={{ marginTop: SPACING.sm, alignSelf: "flex-start", backgroundColor: COLORS.successSoft }}>
                  Evaluación financiera #{evaluation.id} vigente
                </Chip>
              )}
            </View>

            {(promoters.length > 0 || collectors.length > 0) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Personal a cargo</Text>
                {promoters.length > 0 && (
                  <CatalogPickerField
                    label="Promotor"
                    value={promoterId}
                    options={promoters.map((p) => ({ id: p.id, label: p.name }))}
                    onChange={setPromoterId}
                    allowClear
                  />
                )}
                {collectors.length > 0 && (
                  <CatalogPickerField
                    label="Gestor"
                    value={vendorId}
                    options={collectors.map((c) => ({ id: c.id, label: c.name }))}
                    onChange={setVendorId}
                    allowClear
                  />
                )}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Monto y plazo</Text>
              <TextInput
                mode="outlined"
                label="Monto solicitado"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="cash" />}
              />
              <TextInput
                mode="outlined"
                label="Plazo (meses)"
                value={term}
                onChangeText={setTerm}
                keyboardType="number-pad"
                style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="calendar-range" />}
              />
              {frecuencies.length > 0 && (
                <CatalogPickerField
                  label="Frecuencia de pago"
                  value={frequencyId}
                  options={frecuencies.map((f) => ({ id: f.id, label: f.name }))}
                  onChange={setFrequencyId}
                />
              )}
              <Button
                mode="outlined"
                onPress={() => setShowDate("request")}
                style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
                icon="calendar"
              >
                Solicitud: {requestDate}
              </Button>
              {selectedFrequency?.tag === "V" && (
                <Button
                  mode="outlined"
                  onPress={() => setShowDate("due")}
                  style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
                  icon="calendar-end"
                >
                  Vencimiento: {dueDate}
                </Button>
              )}
              {showDate && (
                <DateTimePicker
                  value={new Date(showDate === "request" ? requestDate : dueDate)}
                  mode="date"
                  display="default"
                  onChange={(_, selected) => {
                    const target = showDate;
                    setShowDate(null);
                    if (!selected) return;
                    const iso = selected.toISOString().slice(0, 10);
                    if (target === "request") setRequestDate(iso);
                    else setDueDate(iso);
                  }}
                />
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tasas y cargos</Text>
              <TextInput
                mode="outlined"
                label="Tasa de interés % mensual"
                value={interestRate}
                onChangeText={setInterestRate}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="percent" />}
              />
              <TextInput
                mode="outlined"
                label="Tasa de mora % (opcional)"
                value={defaultedRate}
                onChangeText={setDefaultedRate}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="percent-outline" />}
              />
              <TextInput
                mode="outlined"
                label="Comisión por desembolso (opcional)"
                value={fee}
                onChangeText={setFee}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="cash-minus" />}
              />
              <TextInput
                mode="outlined"
                label="Cargos por seguros (opcional)"
                value={insurance}
                onChangeText={setInsurance}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="shield-check-outline" />}
              />
              <TextInput
                mode="outlined"
                label="Cargos administrativos (opcional)"
                value={otherCharges}
                onChangeText={setOtherCharges}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="file-document-outline" />}
              />
              <TextInput
                mode="outlined"
                label="Deducción (opcional)"
                value={deduction}
                onChangeText={setDeduction}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="cash-remove" />}
              />
            </View>

            {COMPLEMENTARY_FIELDS.some(({ catalogKey }) => (loanCatalogs[catalogKey] || []).length > 0) && (
              <View style={styles.card}>
                <Button
                  mode="text"
                  onPress={() => setShowExtra((v) => !v)}
                  icon={showExtra ? "chevron-up" : "chevron-down"}
                  contentStyle={{ flexDirection: "row-reverse" }}
                  style={{ alignSelf: "flex-start" }}
                >
                  Datos complementarios del crédito
                </Button>
                {showExtra && COMPLEMENTARY_FIELDS.map(({ key, label, catalogKey, labelField }) => {
                  const rows = loanCatalogs[catalogKey] || [];
                  if (rows.length === 0) return null;
                  return (
                    <CatalogPickerField
                      key={key}
                      label={label}
                      value={extra[key]}
                      options={rows.map((r) => ({ id: r.id, label: r[labelField || "name"] || r.name || r.description || String(r.id) }))}
                      onChange={(id) => setExtra((prev) => ({ ...prev, [key]: id }))}
                      allowClear
                    />
                  );
                })}
              </View>
            )}

            <HelperText type="error" visible={!!error}>{error}</HelperText>

            <Button
              mode="contained"
              onPress={() => {
                const v = validateStep1();
                if (v) { setError(v); return; }
                setError("");
                setStep(2);
              }}
              style={{ marginTop: SPACING.md, borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
              labelStyle={{ fontWeight: "700" }}
            >
              Continuar
            </Button>
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View entering={FadeInDown} exiting={FadeOut}>
            <StepHeader step={2} title="Garantías" onBack={() => setStep(1)} />
            <Text style={styles.sub}>Opcional — seleccioná las garantías del cliente que respaldan este crédito.</Text>

            {availableGuarantees.length === 0 ? (
              <View style={[styles.card, { marginTop: SPACING.md }]}>
                <Text style={{ color: COLORS.muted }}>
                  Este cliente no tiene garantías disponibles todavía.
                </Text>
              </View>
            ) : (
              <FlatList
                data={availableGuarantees}
                keyExtractor={(item) => String(item.id)}
                scrollEnabled={false}
                style={{ marginTop: SPACING.md }}
                renderItem={({ item }) => {
                  const checked = selectedGuaranteeIds.includes(item.id);
                  return (
                    <Card style={styles.row}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Checkbox status={checked ? "checked" : "unchecked"} onPress={() => toggleGuarantee(item.id)} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{item.article}{item.brand ? ` · ${item.brand}` : ""}</Text>
                          <Text style={styles.muted}>{money2(item.available_value) || "Sin valor registrado"}</Text>
                        </View>
                        {canPhotoGuarantee && (
                          <IconButton
                            icon="camera-outline"
                            onPress={() => captureGuaranteePhoto(item.id)}
                            loading={uploadingGuaranteeId === item.id}
                            disabled={uploadingGuaranteeId !== null}
                          />
                        )}
                      </View>
                    </Card>
                  );
                }}
              />
            )}

            {canEditCustomer && (
              <Button
                mode="outlined"
                icon="plus"
                onPress={() => setShowAddGuarantee(true)}
                style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
              >
                Agregar garantía
              </Button>
            )}

            {canUploadDocs && checklist.length > 0 && (
              <View style={[styles.card, { marginTop: SPACING.md }]}>
                <Text style={styles.cardTitle}>Documentos del cliente</Text>
                {checklist.map((item) => (
                  <View
                    key={item.code}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.xs }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "600" }}>
                        {item.title}{item.is_mandatory ? " *" : ""}
                      </Text>
                      <Text style={{ color: item.status === "OK" ? COLORS.success : COLORS.muted, fontSize: 12 }}>
                        {item.status === "OK" ? "Cargado" : "Pendiente"}
                      </Text>
                    </View>
                    <IconButton
                      icon={item.status === "OK" ? "camera-plus-outline" : "camera-outline"}
                      onPress={() => captureDocument(item)}
                      loading={uploadingCode === item.code}
                      disabled={uploadingCode !== null}
                    />
                  </View>
                ))}
              </View>
            )}

            <Button
              mode="contained"
              onPress={() => setStep(3)}
              style={{ marginTop: SPACING.md, borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
              labelStyle={{ fontWeight: "700" }}
            >
              Continuar
            </Button>
          </Animated.View>
        )}

        <Portal>
          <Modal
            visible={showAddGuarantee}
            onDismiss={() => setShowAddGuarantee(false)}
            contentContainerStyle={{ backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md }}
          >
            <KeyboardAwareScroll style={{ maxHeight: 520 }}>
              <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm }}>
                Nueva garantía
              </Text>
              <TextInput
                mode="outlined"
                label="Artículo"
                value={newArticle}
                onChangeText={setNewArticle}
                style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
              />
              <TextInput
                mode="outlined"
                label="Marca (opcional)"
                value={newBrand}
                onChangeText={setNewBrand}
                style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
              />
              <TextInput
                mode="outlined"
                label="Serie (opcional)"
                value={newSeries}
                onChangeText={setNewSeries}
                style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
                outlineStyle={{ borderRadius: RADIUS.md }}
              />
              <TextInput
                mode="outlined"
                label="Valor estimado"
                value={newValue}
                onChangeText={setNewValue}
                keyboardType="decimal-pad"
                style={{ backgroundColor: COLORS.card }}
                outlineStyle={{ borderRadius: RADIUS.md }}
                left={<TextInput.Icon icon="cash" />}
              />
              <Button
                mode="contained"
                onPress={addGuarantee}
                loading={savingGuarantee}
                disabled={savingGuarantee}
                style={{ marginTop: SPACING.md, borderRadius: RADIUS.md }}
              >
                Guardar garantía
              </Button>
            </KeyboardAwareScroll>
          </Modal>
        </Portal>

        {step === 3 && (
          <Animated.View entering={FadeInDown} exiting={FadeOut}>
            <StepHeader step={3} title="Confirmar" onBack={() => setStep(2)} />
            <BusinessDayBanner status={businessDayStatus} />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{customer?.customer_name}</Text>
              <CopyableId label="Cédula: " value={customer?.identification} textStyle={styles.muted} />

              <View style={{ marginTop: SPACING.md }}>
                <View style={styles.summaryRow}>
                  <Text style={{ color: COLORS.muted }}>Sucursal</Text>
                  <Text style={{ color: COLORS.text, fontWeight: "600" }}>{branches.find((b) => b.id === branchId)?.name || "-"}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={{ color: COLORS.muted }}>Monto</Text>
                  <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(toNumber(amount))}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={{ color: COLORS.muted }}>Plazo</Text>
                  <Text style={{ color: COLORS.text, fontWeight: "600" }}>{term} meses</Text>
                </View>
                {selectedFrequency && (
                  <View style={styles.summaryRow}>
                    <Text style={{ color: COLORS.muted }}>Frecuencia</Text>
                    <Text style={{ color: COLORS.text, fontWeight: "600" }}>{selectedFrequency.name}</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={{ color: COLORS.muted }}>Tasa de interés</Text>
                  <Text style={{ color: COLORS.text, fontWeight: "600" }}>{interestRate}%</Text>
                </View>
                {selectedPromoter && (
                  <View style={styles.summaryRow}>
                    <Text style={{ color: COLORS.muted }}>Promotor</Text>
                    <Text style={{ color: COLORS.text, fontWeight: "600" }}>{selectedPromoter.name}</Text>
                  </View>
                )}
                {selectedGuaranteeIds.length > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={{ color: COLORS.muted }}>Garantías</Text>
                    <Text style={{ color: COLORS.text, fontWeight: "600" }}>{selectedGuaranteeIds.length} seleccionada(s)</Text>
                  </View>
                )}
              </View>
            </View>

            <HelperText type="error" visible={!!error}>{error}</HelperText>

            <Button
              mode="contained"
              onPress={submit}
              loading={saving}
              disabled={saving}
              style={{ marginTop: SPACING.md, borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
              labelStyle={{ fontWeight: "700" }}
            >
              Enviar solicitud
            </Button>
          </Animated.View>
        )}

        {step === 4 && (
          <Animated.View entering={FadeIn} style={styles.successWrap}>
            <MaterialCommunityIcons name="clock-check-outline" size={72} color={COLORS.warning} />
            <Text variant="headlineSmall" style={{ fontWeight: "800", color: COLORS.text }}>
              Solicitud enviada
            </Text>
            <Text style={{ color: COLORS.muted, textAlign: "center" }}>
              Solicitud #{result?.loan_id} para {customer?.customer_name}, quedó pendiente de aprobación.
            </Text>
            {result?.collateral_exception && (
              <Text style={{ color: COLORS.warning, textAlign: "center" }}>
                Nota: la garantía no cubre el mínimo requerido — queda registrada como excepción.
              </Text>
            )}
            <Button mode="contained" onPress={reset} style={{ marginTop: SPACING.md, borderRadius: RADIUS.md }}>
              Registrar otra solicitud
            </Button>
          </Animated.View>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
