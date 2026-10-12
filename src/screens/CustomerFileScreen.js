import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Image, Linking, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, Chip, ActivityIndicator, HelperText, Portal, Modal } from "react-native-paper";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { isNetworkError } from "../api/credimasterClient";
import { getCustomerChecklist, uploadCustomerDocument, getCustomerDocumentUrl } from "../api/customerDocumentApi";
import { getCustomer, saveCustomerGuarantees } from "../api/customerApi";
import { getCustomerGuarantees } from "../api/guaranteesApi";
import { listGuaranteePhotos, uploadGuaranteePhoto } from "../api/guaranteePhotoApi";
import { enqueue } from "../offline/queue";
import { persistLocalFile } from "../offline/filePersist";
import { useSync } from "../offline/SyncProvider";
import { pickImage } from "../utils/imagePicker";
import { confirmAction } from "../utils/confirm";
import { money, toNumber } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  header: { fontWeight: "800", color: COLORS.text },
  sectionTitle: { fontWeight: "800", color: COLORS.text, marginTop: SPACING.sm },
  hint: { color: COLORS.muted, fontSize: 12 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  title: { color: COLORS.text, fontWeight: "700", flex: 1 },
  muted: { color: COLORS.muted, fontSize: 12 },
  actions: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs, flexWrap: "wrap" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs },
  thumb: { width: 72, height: 72, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff" },
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "88%" },
  viewerImage: { width: "100%", height: 420, borderRadius: RADIUS.md, backgroundColor: "#fff" },
});

const isOk = (status) => String(status || "").toUpperCase() === "OK";

// Expediente del cliente desde la app: documentos del checklist (subir/
// reemplazar/ver) y fotos de las garantías (tomar/galería/ver). Reusa los
// mismos endpoints y la misma cola sin conexión que la pantalla de nueva
// solicitud (GUARANTEE_PHOTO / CUSTOMER_DOCUMENT en offline/syncManager.js),
// así lo que se tome sin señal se sube solo después.
export default function CustomerFileScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const { customerId, customerName } = params;
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();
  const perms = session?.permissions || [];
  const canSeeChecklist = perms.includes("clientes.checklist.ver");
  const canUploadDoc = perms.includes("clientes.documentos.subir");
  const canSeeDocs = perms.includes("clientes.documentos.ver");
  const canSeeGuarantees = perms.includes("garantias.ver");
  const canPhotoGuarantee = perms.includes("garantias.insertar");
  // Crear una garantía es, en el backend, un PUT del cliente (ver
  // saveCustomerGuarantees), por eso pide clientes.editar y no garantias.insertar.
  const canCreateGuarantee = perms.includes("clientes.editar");

  const [checklist, setChecklist] = useState([]);
  const [guarantees, setGuarantees] = useState([]);
  const [photos, setPhotos] = useState({}); // { [guaranteeId]: [{ id, url }] }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // clave de lo que se está subiendo
  const [viewer, setViewer] = useState(null); // { title, url }
  const [showAddGuarantee, setShowAddGuarantee] = useState(false);
  const [savingGuarantee, setSavingGuarantee] = useState(false);
  const [newArticle, setNewArticle] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newSeries, setNewSeries] = useState("");
  const [newValue, setNewValue] = useState("");

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const [cl, gs] = await Promise.all([
          canSeeChecklist ? getCustomerChecklist(session.token, customerId) : [],
          canSeeGuarantees ? getCustomerGuarantees(session.token, customerId) : [],
        ]);
        setChecklist(Array.isArray(cl) ? cl : []);
        const list = Array.isArray(gs) ? gs : [];
        setGuarantees(list);
        if (canSeeGuarantees && list.length) {
          const entries = await Promise.all(
            list.map((g) =>
              listGuaranteePhotos(session.token, g.id)
                .then((r) => [g.id, r?.data || []])
                .catch(() => [g.id, []]),
            ),
          );
          setPhotos(Object.fromEntries(entries));
        } else {
          setPhotos({});
        }
      } catch (e) {
        setError(e?.message || "No se pudo cargar el expediente. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, customerId, canSeeChecklist, canSeeGuarantees],
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Sube (o encola si no hay señal) y devuelve true si quedó enviado o en cola.
  const uploadOrQueue = async ({ key, run, queueItem, queuedMessage }) => {
    setBusy(key);
    setError("");
    try {
      await run();
      return "sent";
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          const stableUri = await persistLocalFile(queueItem.payload.file.uri, queueItem.payload.file.name);
          await enqueue({ ...queueItem, payload: { ...queueItem.payload, file: { ...queueItem.payload.file, uri: stableUri } } });
          refreshPendingCount();
          Alert.alert("Sin conexión", queuedMessage);
          return "queued";
        } catch (queueErr) {
          setError(queueErr?.message ?? "No se pudo guardar para enviarlo después");
          return null;
        }
      }
      setError(e?.message ?? "No se pudo subir");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const pick = async () => {
    try {
      return await pickImage();
    } catch (e) {
      setError(e?.message ?? "No se pudo abrir la cámara/galería");
      return null;
    }
  };

  const onUploadDocument = async (item) => {
    const file = await pick();
    if (!file) return;
    const options = { docType: "OTRO", docName: item.title, relatedItemCode: item.code };
    const result = await uploadOrQueue({
      key: `doc-${item.code}`,
      run: () => uploadCustomerDocument(session.token, customerId, file, options),
      queueItem: {
        type: "CUSTOMER_DOCUMENT",
        label: `Documento: ${item.title}`,
        payload: { customerId, file, options },
      },
      queuedMessage: "El documento se guardó en el equipo y se subirá solo cuando vuelva la señal.",
    });
    if (result === "sent") load(true);
  };

  const onUploadOther = async () => {
    const file = await pick();
    if (!file) return;
    const options = { docType: "OTRO", docName: "Documento adicional", relatedItemCode: "OTHER_DOC" };
    const result = await uploadOrQueue({
      key: "doc-other",
      run: () => uploadCustomerDocument(session.token, customerId, file, options),
      queueItem: {
        type: "CUSTOMER_DOCUMENT",
        label: "Documento adicional del expediente",
        payload: { customerId, file, options },
      },
      queuedMessage: "El documento se guardó en el equipo y se subirá solo cuando vuelva la señal.",
    });
    if (result === "sent") Alert.alert("Listo", "El documento se subió al expediente.");
  };

  const onViewDocument = async (item) => {
    setBusy(`view-${item.code}`);
    setError("");
    try {
      const res = await getCustomerDocumentUrl(session.token, item.document_id);
      if (String(res?.mime_type || "").startsWith("image/")) {
        setViewer({ title: item.title, url: res.url });
      } else {
        await Linking.openURL(res.url);
      }
    } catch (e) {
      setError(e?.message ?? "No se pudo abrir el documento");
    } finally {
      setBusy(null);
    }
  };

  // Mismo guardado que la pantalla de nueva solicitud: el backend espera la
  // lista COMPLETA de garantías del cliente (existentes + la nueva) dentro de
  // un PUT del cliente completo.
  const saveGuarantee = async () => {
    try {
      setSavingGuarantee(true);
      setError("");
      const fullRes = await getCustomer(session.token, customerId);
      const fullCustomer = fullRes?.data?.customer;
      const existing = guarantees.map((g) => ({
        id: g.id,
        article: g.article,
        series: g.series,
        brand: g.brand,
        value: g.value,
      }));
      const created = {
        article: newArticle.trim() || null,
        series: newSeries.trim() || null,
        brand: newBrand.trim() || null,
        value: toNumber(newValue) || null,
      };
      await saveCustomerGuarantees(session.token, customerId, fullCustomer, [...existing, created]);
      setNewArticle("");
      setNewBrand("");
      setNewSeries("");
      setNewValue("");
      setShowAddGuarantee(false);
      await load(true);
    } catch (e) {
      setError(e?.message ?? "No se pudo agregar la garantía");
    } finally {
      setSavingGuarantee(false);
    }
  };

  const addGuarantee = () => {
    if (!newArticle.trim() && !newBrand.trim() && !toNumber(newValue)) {
      Alert.alert("Falta información", "Ingresá al menos el artículo o el valor de la garantía.");
      return;
    }
    confirmAction(
      "Agregar garantía",
      `¿Guardar "${newArticle.trim() || newBrand.trim() || "esta garantía"}" en el expediente del cliente?`,
      saveGuarantee,
    );
  };

  const onPhotoGuarantee = async (g) => {
    const file = await pick();
    if (!file) return;
    const result = await uploadOrQueue({
      key: `gar-${g.id}`,
      run: () => uploadGuaranteePhoto(session.token, g.id, file),
      queueItem: {
        type: "GUARANTEE_PHOTO",
        label: `Foto de garantía #${g.id}`,
        payload: { guaranteeId: g.id, file },
      },
      queuedMessage: "La foto se guardó en el equipo y se subirá sola cuando vuelva la señal.",
    });
    if (result === "sent") load(true);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text variant="headlineSmall" style={styles.header}>{customerName || "Cliente"}</Text>
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        {loading && <ActivityIndicator color={COLORS.primary} />}

        {canSeeChecklist && !loading && (
          <>
            <Text style={styles.sectionTitle}>Documentos del expediente</Text>
            <Text style={styles.hint}>Tomá una foto del documento o elegila de la galería. Se marca como entregado al subirlo.</Text>
            {checklist.length === 0 && <Text style={styles.muted}>Este cliente no tiene checklist de documentos.</Text>}
            {checklist.map((item) => (
              <View key={item.code} style={styles.card}>
                <View style={styles.rowTop}>
                  <Text style={styles.title}>{item.title}</Text>
                  {!!item.is_mandatory && (
                    <Chip compact textStyle={{ fontSize: 10 }} style={{ backgroundColor: COLORS.warningSoft }}>Obligatorio</Chip>
                  )}
                </View>
                <View style={styles.rowTop}>
                  <Chip
                    compact
                    icon={isOk(item.status) ? "check-circle" : "clock-outline"}
                    style={{ backgroundColor: isOk(item.status) ? COLORS.successSoft : COLORS.dangerSoft }}
                    textStyle={{ color: isOk(item.status) ? COLORS.success : COLORS.danger, fontWeight: "700" }}
                  >
                    {isOk(item.status) ? "Entregado" : "Pendiente"}
                  </Chip>
                  {!!item.document_name && <Text style={styles.muted} numberOfLines={1}>{item.document_name}</Text>}
                </View>
                <View style={styles.actions}>
                  {canUploadDoc && (
                    <Button
                      compact
                      mode={isOk(item.status) ? "outlined" : "contained"}
                      icon="camera-outline"
                      onPress={() => onUploadDocument(item)}
                      loading={busy === `doc-${item.code}`}
                      disabled={busy !== null}
                    >
                      {item.document_id ? "Reemplazar" : "Subir"}
                    </Button>
                  )}
                  {canSeeDocs && !!item.document_id && (
                    <Button
                      compact
                      mode="outlined"
                      icon="eye-outline"
                      onPress={() => onViewDocument(item)}
                      loading={busy === `view-${item.code}`}
                      disabled={busy !== null}
                    >
                      Ver
                    </Button>
                  )}
                </View>
              </View>
            ))}
            {canUploadDoc && (
              <Button
                mode="outlined"
                icon="file-plus-outline"
                onPress={onUploadOther}
                loading={busy === "doc-other"}
                disabled={busy !== null}
                style={{ borderRadius: RADIUS.md, alignSelf: "flex-start" }}
              >
                Subir otro documento
              </Button>
            )}
          </>
        )}

        {canSeeGuarantees && !loading && (
          <>
            <Text style={styles.sectionTitle}>Garantías</Text>
            {guarantees.length === 0 && <Text style={styles.muted}>Este cliente no tiene garantías registradas.</Text>}
            {canCreateGuarantee && (
              <Button
                mode="outlined"
                icon="plus"
                onPress={() => setShowAddGuarantee(true)}
                disabled={busy !== null}
                style={{ borderRadius: RADIUS.md, alignSelf: "flex-start" }}
              >
                Agregar garantía
              </Button>
            )}
            {guarantees.map((g) => {
              const list = photos[g.id] || [];
              return (
                <View key={g.id} style={styles.card}>
                  <Text style={styles.title}>{g.article}{g.brand ? ` · ${g.brand}` : ""}</Text>
                  <Text style={styles.muted}>
                    {[g.series ? `Serie: ${g.series}` : "", g.value ? money(g.value) : "Sin valor registrado"].filter(Boolean).join(" · ")}
                    {g.is_committed ? ` · En uso (crédito ${g.committed_credit_code || g.committed_loan_id})` : ""}
                  </Text>
                  {list.length > 0 ? (
                    <View style={styles.thumbs}>
                      {list.map((p) => (
                        <Pressable key={p.id} onPress={() => setViewer({ title: g.article, url: p.url })}>
                          <Image source={{ uri: p.url }} style={styles.thumb} resizeMode="cover" />
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.muted}>Sin fotos todavía.</Text>
                  )}
                  {canPhotoGuarantee && (
                    <View style={styles.actions}>
                      <Button
                        compact
                        mode="contained"
                        icon="camera-plus-outline"
                        onPress={() => onPhotoGuarantee(g)}
                        loading={busy === `gar-${g.id}`}
                        disabled={busy !== null}
                      >
                        Agregar foto
                      </Button>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {!loading && !canSeeChecklist && !canSeeGuarantees && (
          <Text style={styles.muted}>Tu usuario no tiene permisos para ver el expediente ni las garantías.</Text>
        )}
        <Button onPress={() => navigation.goBack()} style={{ alignSelf: "flex-start" }}>Volver</Button>
      </ScrollView>

      <Portal>
        <Modal visible={!!viewer} onDismiss={() => setViewer(null)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={styles.title}>{viewer?.title}</Text>
          {!!viewer && <Image source={{ uri: viewer.url }} style={styles.viewerImage} resizeMode="contain" />}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACING.xs, marginTop: SPACING.sm }}>
            <Button onPress={() => setViewer(null)}>Cerrar</Button>
          </View>
        </Modal>

        <Modal
          visible={showAddGuarantee}
          onDismiss={() => setShowAddGuarantee(false)}
          contentContainerStyle={styles.modal}
        >
          <Text variant="titleMedium" style={[styles.title, { marginBottom: SPACING.sm }]}>Nueva garantía</Text>
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
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}
