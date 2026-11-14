import React, { useCallback, useContext, useMemo, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, IconButton, Portal, Modal, TextInput, Chip, Searchbar } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getPendingDeliveries, markDelivered, reportNotDelivered, MAX_DELIVERY_PHOTOS } from "../api/remittanceApi";
import { getCreditPolicies } from "../api/creditPolicyApi";
import { takePhoto } from "../utils/imagePicker";
import { confirmAction } from "../utils/confirm";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import CopyableId from "../components/CopyableId";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import { withCode } from "../utils/customerLabel";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import useKeyboardModalStyle from "../components/useKeyboardModalStyle";

// Para buscar sin importar mayúsculas ni tildes.
const norm = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const IMAGE_REQUIRED_TRUE = ["true", "1", "si", "sí"];

const METHOD_LABEL = { CHEQUE: "Cheque", TRANSFERENCIA: "Transferencia", EFECTIVO: "Efectivo" };

// Motivos de «No se pudo entregar» (mismos códigos que el servidor).
const FAILED_REASONS = [
  ["CLIENTE_AUSENTE", "Cliente no estaba"],
  ["CLIENTE_DESISTE", "Ya no quiere el crédito"],
  ["DIRECCION_INCORRECTA", "Dirección incorrecta"],
  ["OTRO", "Otro"],
];

// De dónde sale el dinero: número de cheque y cuenta, o la caja.
const sourceLabel = (item) => {
  if (item.check_number) return `Cheque #${item.check_number}${item.bank_account_alias ? ` · ${item.bank_account_alias}` : ""}`;
  return item.cash_register_name || item.bank_account_alias || "";
};

// disbursed_at llega como "YYYY-MM-DD HH:mm:ss" en hora de Nicaragua (la
// sesión MySQL está en -06:00), así que se muestra tal cual, sin convertir zona.
const formatDisbursedAt = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "";
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  listContent: { padding: SPACING.lg, paddingTop: 0, paddingBottom: SPACING.xl, gap: SPACING.sm },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  amount: { fontWeight: "800", color: COLORS.primary, fontSize: 16 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md },
  photosRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.sm },
  thumb: { width: 76, height: 76, borderRadius: RADIUS.md, backgroundColor: COLORS.border },
  thumbWrap: { position: "relative" },
  thumbRemove: { position: "absolute", top: -10, right: -10, margin: 0, backgroundColor: COLORS.card },
});

export default function PendingDeliveriesScreen() {
  const modalStyle = useKeyboardModalStyle(styles.modal);
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);

  const [deliveries, setDeliveries] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // null = no se pudo leer la política (sin permiso de catálogos); el
  // servidor igual la valida y su mensaje se muestra al confirmar.
  const [imageRequired, setImageRequired] = useState(null);

  const [active, setActive] = useState(null); // remesa seleccionada para confirmar
  // "deliver" = Marcar entregado; "failed" = No se pudo entregar.
  const [mode, setMode] = useState("deliver");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const savingRef = useRef(false);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Busca por nombre, código o cédula del cliente, número de crédito, cheque o caja; varias palabras = todas deben coincidir.
  const visibleDeliveries = useMemo(() => {
    const words = norm(search).split(/\s+/).filter(Boolean);
    if (!words.length) return deliveries;
    return deliveries.filter((d) => {
      const hay = norm(
        [d.customer_name, d.customer_code, d.customer_identification, d.credit_code, d.loan_id, d.check_number, d.cash_register_name, d.bank_account_alias].join(" "),
      );
      return words.every((w) => hay.includes(w));
    });
  }, [deliveries, search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getPendingDeliveries(session.token);
      setDeliveries(res?.data || []);
    } catch (e) {
      setError(e?.message ?? "Error cargando entregas pendientes");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(
    useCallback(() => {
      getCreditPolicies(session.token)
        .then((rows) => {
          const policy = (rows || []).find((p) => p.policy_key === "delivery_image_required");
          setImageRequired(IMAGE_REQUIRED_TRUE.includes(String(policy?.policy_value || "").trim().toLowerCase()));
        })
        .catch(() => {});
    }, [session.token]),
  );

  const openConfirm = (item, nextMode = "deliver") => {
    setActive(item);
    setMode(nextMode);
    setReason("");
    setNotice("");
    setNotes("");
    setPhotos([]);
    setModalError("");
  };

  // takePhoto usa la cámara dentro de la app (components/InAppCameraHost.js).
  const capturePhoto = async () => {
    try {
      const file = await takePhoto();
      if (file) setPhotos((list) => [...list, file].slice(0, MAX_DELIVERY_PHOTOS));
    } catch (e) {
      setModalError(e?.message ?? "No se pudo capturar la foto");
    }
  };

  const submitDelivery = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setSaving(true);
      setModalError("");
      await markDelivered(session.token, active.loan_id, { deliveryNotes: notes, files: photos });
      setActive(null);
      load();
    } catch (e) {
      setModalError(e?.message ?? "No se pudo registrar la entrega");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submitNotDelivered = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setSaving(true);
      setModalError("");
      const res = await reportNotDelivered(session.token, active.loan_id, { reasonCode: reason, notes, files: photos });
      setActive(null);
      setNotice(res?.message || "Quedó reportado. Devolvé el dinero a la oficina.");
      load();
    } catch (e) {
      setModalError(e?.message ?? "No se pudo registrar el reporte");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const confirmNotDelivered = () => {
    if (!reason) {
      setModalError("Elegí el motivo por el que no se pudo entregar.");
      return;
    }
    if (reason === "OTRO" && notes.trim().length < 5) {
      setModalError("Explicá el motivo en la nota (al menos 5 letras).");
      return;
    }
    confirmAction(
      "No se pudo entregar",
      `¿Confirmás que NO entregaste el dinero a ${active?.customer_name}? Tenés que devolverlo a la oficina.`,
      submitNotDelivered,
    );
  };

  const confirmDelivery = () => {
    if (imageRequired === true && !photos.length) {
      setModalError("Tomá al menos una foto de la entrega: es obligatoria.");
      return;
    }
    confirmAction("Confirmar entrega", `¿Confirmás que el crédito de ${active?.customer_name} ya fue entregado al cliente?`, submitDelivery);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Mis entregas pendientes</Text>
      </View>
      <Text style={styles.sub}>Créditos ya desembolsados que faltan entregar al cliente</Text>

      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>
      {!!notice && (
        <Card style={{ marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.primarySoft }}>
          <Text style={{ color: COLORS.text }}>{notice}</Text>
        </Card>
      )}
      {!loading && deliveries.length > 0 && (
        <Searchbar
          placeholder="Buscar por nombre, cédula o crédito"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          style={{ marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.card, borderRadius: RADIUS.md }}
          inputStyle={{ minHeight: 0 }}
        />
      )}
      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {!loading && (
        <FlatList
          data={visibleDeliveries}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {deliveries.length && search.trim() ? "Ninguna entrega coincide con la búsqueda." : "No tenés entregas pendientes."}
            </Text>
          }
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{withCode(item.customer_name, item.customer_code)}</Text>
                <Text style={styles.amount}>{money(item.amount)}</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
                <Text style={styles.muted}>Crédito #{item.credit_code || item.loan_id} · </Text>
                <CopyableId label="Cédula: " value={item.customer_identification} textStyle={styles.muted} />
              </View>
              {!!sourceLabel(item) && <Text style={styles.muted}>{sourceLabel(item)}</Text>}
              {!!formatDisbursedAt(item.disbursed_at) && (
                <Text style={styles.muted}>Desembolsado: {formatDisbursedAt(item.disbursed_at)}</Text>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.xs }}>
                <Chip compact style={{ backgroundColor: COLORS.primarySoft }}>
                  {METHOD_LABEL[item.disbursement_method] || item.disbursement_method}
                </Chip>
                <Button mode="contained" compact onPress={() => openConfirm(item)} style={{ borderRadius: RADIUS.md }}>
                  Marcar entregado
                </Button>
              </View>
              <Button
                mode="text"
                compact
                icon="close-circle-outline"
                textColor={COLORS.danger}
                onPress={() => openConfirm(item, "failed")}
                style={{ alignSelf: "flex-end", marginTop: SPACING.xs }}
              >
                No se pudo entregar
              </Button>
            </Card>
          )}
        />
      )}

      <Portal>
        <Modal visible={!!active} onDismiss={() => setActive(null)} contentContainerStyle={modalStyle}>
          <KeyboardAwareScroll style={{ maxHeight: 520 }}>
            <Text variant="titleMedium" style={{ fontWeight: "800", color: mode === "failed" ? COLORS.danger : COLORS.text }}>
              {mode === "failed" ? "No se pudo entregar" : "Confirmar entrega"}
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 2 }}>{withCode(active?.customer_name, active?.customer_code)}</Text>
            <Text style={{ color: COLORS.muted }}>
              {money(active?.amount)} ·{" "}
              {(active && sourceLabel(active)) || METHOD_LABEL[active?.disbursement_method] || active?.disbursement_method}
            </Text>

            {mode === "failed" && (
              <>
                <Text style={{ color: COLORS.text, fontWeight: "700", marginTop: SPACING.md }}>¿Por qué no se entregó?</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs }}>
                  {FAILED_REASONS.map(([code, label]) => (
                    <Chip
                      key={code}
                      selected={reason === code}
                      onPress={() => setReason(code)}
                      style={{ backgroundColor: reason === code ? COLORS.primarySoft : COLORS.bg }}
                    >
                      {label}
                    </Chip>
                  ))}
                </View>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: SPACING.xs }}>
                  El dinero se devuelve a la oficina. Ellos deciden si se intenta otra vez o si se anula.
                </Text>
              </>
            )}

            <TextInput
              mode="outlined"
              label={mode === "failed" ? (reason === "OTRO" ? "Explicá qué pasó" : "Nota (opcional)") : "Notas de la entrega (opcional)"}
              value={notes}
              onChangeText={setNotes}
              multiline
              style={{ backgroundColor: COLORS.card, marginTop: SPACING.md }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />

            <Text style={{ color: COLORS.text, fontWeight: "700", marginTop: SPACING.md }}>
              {mode === "failed"
                ? "Fotos (opcional)"
                : `Fotos de la entrega${imageRequired === true ? " (obligatoria, al menos una)" : imageRequired === false ? " (opcional)" : ""}`}
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>
              {mode === "failed"
                ? "Por ejemplo, la casa o el negocio cerrado."
                : "Evidencia de que le entregaste el dinero al cliente: el recibido, la firma o el dinero en la mano."}
            </Text>

            {photos.length > 0 && (
              <View style={styles.photosRow}>
                {photos.map((p, i) => (
                  <View key={`${p.uri}-${i}`} style={styles.thumbWrap}>
                    <Image source={{ uri: p.uri }} style={styles.thumb} />
                    <IconButton
                      icon="close-circle"
                      size={22}
                      iconColor={COLORS.danger}
                      style={styles.thumbRemove}
                      onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                      accessibilityLabel="Quitar foto"
                    />
                  </View>
                ))}
              </View>
            )}

            <Button
              mode="outlined"
              icon="camera-outline"
              onPress={capturePhoto}
              disabled={photos.length >= MAX_DELIVERY_PHOTOS}
              style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              {photos.length ? `Agregar otra foto (${photos.length}/${MAX_DELIVERY_PHOTOS})` : "Tomar foto"}
            </Button>

            <HelperText type="error" visible={!!modalError}>{modalError}</HelperText>

            <Button
              mode="contained"
              onPress={mode === "failed" ? confirmNotDelivered : confirmDelivery}
              loading={saving}
              disabled={saving}
              buttonColor={mode === "failed" ? COLORS.danger : undefined}
              style={{ marginTop: SPACING.md, borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
            >
              {mode === "failed" ? "Reportar no entregado" : "Confirmar entrega"}
            </Button>
          </KeyboardAwareScroll>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}
