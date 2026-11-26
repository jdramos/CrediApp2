import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Image, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Button, Chip, ActivityIndicator, HelperText, Portal, Modal } from "react-native-paper";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { isNetworkError } from "../api/credimasterClient";
import { getCustomerChecklist, uploadCustomerDocument, getCustomerDocumentUrl, listCustomerDocuments } from "../api/customerDocumentApi";
import { enqueue } from "../offline/queue";
import { persistLocalFile } from "../offline/filePersist";
import { useSync } from "../offline/SyncProvider";
import { pickImage } from "../utils/imagePicker";
import { buildPdfFromPhotos } from "../utils/pdfFromPhotos";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import GuaranteesPanel, { canUseGuarantees } from "../components/GuaranteesPanel";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
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
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "92%" },
  viewerImage: { width: "100%", height: 320, borderRadius: RADIUS.md, backgroundColor: "#fff" },
});

const isOk = (status) => String(status || "").toUpperCase() === "OK";

// Expediente del cliente desde la app: documentos del checklist (subir/
// reemplazar/ver) y las garantías (componente GuaranteesPanel: agregar, editar, fotos). Reusa los
// mismos endpoints y la misma cola sin conexión que la pantalla de nueva
// solicitud (GUARANTEE_PHOTO / CUSTOMER_DOCUMENT en offline/syncManager.js),
// así lo que se tome sin señal se sube solo después.
export default function CustomerFileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { params } = route;
  const { customerId, customerName } = params;
  // La misma pantalla sirve a dos entradas separadas: Documentos del expediente y Garantías (cada una en su pantalla).
  // "CustomerFile" (la antigua, con ambas) sigue registrada por si algo la abre.
  const wantDocs = route.name !== "CustomerGuarantees";
  const wantGuarantees = route.name !== "CustomerDocuments";
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();
  const perms = session?.permissions || [];
  const canSeeChecklist = perms.includes("clientes.checklist.ver");
  const canUploadDoc = perms.includes("clientes.documentos.subir");
  const canSeeDocs = perms.includes("clientes.documentos.ver");
  // Se ofrece la sección con solo poder agregar (no hace falta poder ver el checklist o las garantías).
  const showDocs = wantDocs && (canSeeChecklist || canUploadDoc || canSeeDocs);
  const showGuarantees = wantGuarantees && canUseGuarantees(perms);

  const [checklist, setChecklist] = useState([]);
  const [otherDocs, setOtherDocs] = useState([]); // documentos subidos que no son de un ítem del checklist
  // Lo enviado en esta visita: quien no puede VER documentos ni fotos (rol sin clientes.documentos.ver /
  // garantias.ver) igual ve que sus envíos salieron.
  const [sentNow, setSentNow] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // clave de lo que se está subiendo
  const [viewer, setViewer] = useState(null); // { title, url }
  // Foto elegida que todavía NO se guardó: se puede cambiar por otra antes de
  // guardarla "definitivamente". Una vez guardada ya no se puede reemplazar
  // ni eliminar desde la app.
  // `files` son las páginas (fotos); los documentos admiten varias y se juntan en
  // un solo PDF al guardar (`multi`); las fotos de garantía son una sola.
  const [draft, setDraft] = useState(null); // { title, files, multi, save(file), itemCode? }
  // Ítems del checklist cuyo documento quedó EN COLA (sin señal): ya no se
  // ofrece "Subir" de nuevo, para no encolar el mismo documento dos veces.
  const [queuedCodes, setQueuedCodes] = useState([]);
  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const [cl, docs] = await Promise.all([
          wantDocs && canSeeChecklist ? getCustomerChecklist(session.token, customerId) : [],
          wantDocs && canSeeDocs ? listCustomerDocuments(session.token, customerId).catch(() => []) : [],
        ]);
        const checklistRows = Array.isArray(cl) ? cl : [];
        setChecklist(checklistRows);
        const checklistCodes = new Set(checklistRows.map((i) => i.code));
        setOtherDocs(
          (Array.isArray(docs) ? docs : []).filter((d) => !d.related_item_code || !checklistCodes.has(d.related_item_code) || d.related_item_code === "OTHER_DOC"),
        );
      } catch (e) {
        setError(e?.message || "No se pudo cargar el expediente. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, customerId, canSeeChecklist, canSeeDocs, wantDocs],
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

  // Paso 1: elegir la primera foto (cámara o galería) y mostrarla para revisarla.
  const startDraft = async (title, save, itemCode, { multi = false } = {}) => {
    const file = await pick();
    if (!file) return;
    setError("");
    setDraft({ title, files: [file], multi, save, itemCode });
  };

  // Páginas: agregar otra, reemplazar una o quitar una -- todo ANTES de guardar.
  const addPage = async () => {
    const file = await pick();
    if (file) setDraft((d) => (d ? { ...d, files: [...d.files, file] } : d));
  };
  const replacePage = async (index) => {
    const file = await pick();
    if (file) setDraft((d) => (d ? { ...d, files: d.files.map((f, i) => (i === index ? file : f)) } : d));
  };
  const removePage = (index) => {
    setDraft((d) => (d && d.files.length > 1 ? { ...d, files: d.files.filter((_, i) => i !== index) } : d));
  };

  // Paso 2: guardar definitivamente. Con una sola foto se sube tal cual; con
  // varias se arma un PDF de varias páginas y se sube ese.
  const confirmDraft = async () => {
    const d = draft;
    if (!d || !d.files.length) return;
    let fileToSave = d.files[0];
    if (d.files.length > 1) {
      setBusy("draft");
      setError("");
      try {
        fileToSave = await buildPdfFromPhotos(d.files, "documento");
      } catch (e) {
        setError(e?.message ?? "No se pudo armar el documento de varias páginas");
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    const result = await d.save(fileToSave);
    if (result) {
      setDraft(null);
      if (result === "queued" && d.itemCode) setQueuedCodes((c) => [...c, d.itemCode]);
      if (result === "sent") {
        setSentNow((list) => [...list, { id: `${Date.now()}-${list.length}`, title: d.title }]);
        load(true);
      }
    }
  };

  const onUploadDocument = (item) => {
    const options = { docType: "OTRO", docName: item.title, relatedItemCode: item.code };
    startDraft(item.title, (file) =>
      uploadOrQueue({
        key: "draft",
        run: () => uploadCustomerDocument(session.token, customerId, file, options),
        queueItem: {
          type: "CUSTOMER_DOCUMENT",
          label: `Documento: ${item.title}`,
          payload: { customerId, file, options },
        },
        queuedMessage: "El documento se guardó en el equipo y se subirá solo cuando vuelva la señal.",
      }),
      item.code,
      { multi: true },
    );
  };

  const onUploadOther = () => {
    const options = { docType: "OTRO", docName: "Documento adicional", relatedItemCode: "OTHER_DOC" };
    startDraft("Documento adicional", (file) =>
      uploadOrQueue({
        key: "draft",
        run: () => uploadCustomerDocument(session.token, customerId, file, options),
        queueItem: {
          type: "CUSTOMER_DOCUMENT",
          label: "Documento adicional del expediente",
          payload: { customerId, file, options },
        },
        queuedMessage: "El documento se guardó en el equipo y se subirá solo cuando vuelva la señal.",
      }),
      undefined,
      { multi: true },
    );
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

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text variant="headlineSmall" style={styles.header}>{customerName || "Cliente"}</Text>
        <HelperText type="error" visible={!!error}>{error}</HelperText>
        {loading && <ActivityIndicator color={COLORS.primary} />}

        {wantDocs && sentNow.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.title}>Enviado en esta visita</Text>
            {sentNow.map((s) => (
              <Text key={s.id} style={{ color: COLORS.success, fontWeight: "600" }}>✓ {s.title}</Text>
            ))}
            {!canSeeDocs && (
              <Text style={styles.muted}>Su rol no puede ver los documentos ya subidos; el listado completo lo ve la oficina.</Text>
            )}
          </View>
        )}

        {showDocs && !loading && (
          <>
            <Text style={styles.sectionTitle}>Documentos del expediente</Text>
            <Text style={styles.hint}>Tomá una foto del documento o elegila de la galería. Se marca como entregado al subirlo.</Text>
            {checklist.length === 0 && canSeeChecklist && (
              <Text style={styles.muted}>La empresa no definió documentos obligatorios: suba los que tenga con «Subir otro documento».</Text>
            )}
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
                  {queuedCodes.includes(item.code) && !item.document_id && (
                    <Text style={styles.muted}>En cola: se enviará cuando haya señal</Text>
                  )}
                </View>
                <View style={styles.actions}>
                  {canUploadDoc && !item.document_id && !queuedCodes.includes(item.code) && (
                    <Button
                      compact
                      mode="contained"
                      icon="camera-outline"
                      onPress={() => onUploadDocument(item)}
                      disabled={busy !== null}
                    >
                      Subir
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
            {otherDocs.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Documentos subidos</Text>
                {otherDocs.map((d) => (
                  <View key={d.id} style={styles.card}>
                    <View style={styles.rowTop}>
                      <Text style={styles.title} numberOfLines={1}>{d.doc_name || "Documento"}</Text>
                      <Chip compact icon="check-circle" style={{ backgroundColor: COLORS.successSoft }} textStyle={{ color: COLORS.success, fontWeight: "700" }}>
                        Subido
                      </Chip>
                    </View>
                    {!!d.uploaded_at && <Text style={styles.muted}>{String(d.uploaded_at).slice(0, 10)}</Text>}
                    {canSeeDocs && (
                      <View style={styles.actions}>
                        <Button
                          compact
                          mode="outlined"
                          icon="eye-outline"
                          onPress={() => onViewDocument({ code: `doc-${d.id}`, document_id: d.id, title: d.doc_name || "Documento" })}
                          loading={busy === `view-doc-${d.id}`}
                          disabled={busy !== null}
                        >
                          Ver
                        </Button>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}
            {canUploadDoc && (
              <Button
                mode="outlined"
                icon="file-plus-outline"
                onPress={onUploadOther}
                disabled={busy !== null}
                style={{ borderRadius: RADIUS.md, alignSelf: "flex-start" }}
              >
                Subir otro documento
              </Button>
            )}
          </>
        )}

        {showGuarantees && <GuaranteesPanel customerId={customerId} />}

        {!loading && !showDocs && !showGuarantees && (
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

        <Modal visible={!!draft} onDismiss={() => busy === null && setDraft(null)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={styles.title}>Revisá antes de guardar</Text>
          <Text style={styles.muted}>{draft?.title}</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {(draft?.files || []).map((f, i) => (
              <View key={`${f.uri}-${i}`} style={{ marginTop: SPACING.sm }}>
                {draft.multi && <Text style={styles.muted}>Página {i + 1} de {draft.files.length}</Text>}
                <Image source={{ uri: f.uri }} style={styles.viewerImage} resizeMode="contain" />
                <View style={{ flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs }}>
                  <Button compact icon="camera-retake-outline" onPress={() => replacePage(i)} disabled={busy !== null}>
                    Tomar / elegir otra
                  </Button>
                  {draft.files.length > 1 && (
                    <Button compact icon="close" textColor={COLORS.danger} onPress={() => removePage(i)} disabled={busy !== null}>
                      Quitar página
                    </Button>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
          {!!draft?.multi && (
            <Button
              mode="outlined"
              icon="plus"
              onPress={addPage}
              disabled={busy !== null}
              style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              Agregar otra página
            </Button>
          )}
          <Text style={[styles.muted, { marginTop: SPACING.sm }]}>
            {draft?.multi && draft.files.length > 1
              ? `Se guardará como un solo documento PDF de ${draft.files.length} páginas. `
              : ""}
            Una vez guardado queda definitivo: no se puede reemplazar ni eliminar desde la app.
          </Text>
          <HelperText type="error" visible={!!error}>{error}</HelperText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: SPACING.xs }}>
            <Button onPress={() => setDraft(null)} disabled={busy !== null}>Cancelar</Button>
            <Button mode="contained" icon="content-save-outline" onPress={confirmDraft} loading={busy === "draft"} disabled={busy !== null}>
              Guardar definitivamente
            </Button>
          </View>
        </Modal>

      </Portal>
    </SafeAreaView>
  );
}
