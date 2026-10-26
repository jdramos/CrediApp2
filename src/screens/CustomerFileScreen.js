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
import { buildPdfFromPhotos } from "../utils/pdfFromPhotos";
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
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "92%" },
  viewerImage: { width: "100%", height: 320, borderRadius: RADIUS.md, backgroundColor: "#fff" },
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
  // Foto elegida que todavía NO se guardó: se puede cambiar por otra antes de
  // guardarla "definitivamente". Una vez guardada ya no se puede reemplazar
  // ni eliminar desde la app.
  // `files` son las páginas (fotos); los documentos admiten varias y se juntan en
  // un solo PDF al guardar (`multi`); las fotos de garantía son una sola.
  const [draft, setDraft] = useState(null); // { title, files, multi, save(file), itemCode? }
  // Ítems del checklist cuyo documento quedó EN COLA (sin señal): ya no se
  // ofrece "Subir" de nuevo, para no encolar el mismo documento dos veces.
  const [queuedCodes, setQueuedCodes] = useState([]);
  const [showAddGuarantee, setShowAddGuarantee] = useState(false);
  const [savingGuarantee, setSavingGuarantee] = useState(false);
  const [newArticle, setNewArticle] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newSeries, setNewSeries] = useState("");
  const [newValue, setNewValue] = useState("");
  // Fotos de la garantía que se está creando (todavía sin guardar: se pueden
  // cambiar o quitar). Al guardar la garantía se suben a ella.
  const [newPhotos, setNewPhotos] = useState([]);
  const MAX_NEW_PHOTOS = 6;

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

  const addNewPhoto = async () => {
    const file = await pick();
    if (file) setNewPhotos((list) => (list.length < MAX_NEW_PHOTOS ? [...list, file] : list));
  };
  const replaceNewPhoto = async (index) => {
    const file = await pick();
    if (file) setNewPhotos((list) => list.map((f, i) => (i === index ? file : f)));
  };
  const removeNewPhoto = (index) => setNewPhotos((list) => list.filter((_, i) => i !== index));

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
      if (result === "sent") load(true);
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

      // Las fotos se suben a la garantía recién creada: se busca su id entre las del
      // cliente (la que no estaba antes). La garantía ya quedó guardada, así que si
      // una foto falla NO se vuelve a crear; se avisa y se puede subir desde su tarjeta.
      let photoProblem = "";
      if (newPhotos.length && canPhotoGuarantee) {
        const knownIds = new Set(existing.map((g) => g.id));
        const fresh = await getCustomerGuarantees(session.token, customerId);
        const createdGuarantee = (Array.isArray(fresh) ? fresh : []).filter((g) => !knownIds.has(g.id)).sort((a, b) => b.id - a.id)[0];
        if (!createdGuarantee) {
          photoProblem = "No se encontró la garantía recién creada para subirle las fotos.";
        } else {
          for (const file of newPhotos) {
            const result = await uploadOrQueue({
              key: "newGuarantee",
              run: () => uploadGuaranteePhoto(session.token, createdGuarantee.id, file),
              queueItem: {
                type: "GUARANTEE_PHOTO",
                label: `Foto de garantía #${createdGuarantee.id}`,
                payload: { guaranteeId: createdGuarantee.id, file },
              },
              queuedMessage: "La foto se guardó en el equipo y se subirá sola cuando vuelva la señal.",
            });
            if (!result) {
              photoProblem = "La garantía se guardó, pero una foto no se pudo subir. Subila desde la tarjeta de la garantía.";
              break;
            }
          }
        }
      }

      setNewArticle("");
      setNewBrand("");
      setNewSeries("");
      setNewValue("");
      setNewPhotos([]);
      setShowAddGuarantee(false);
      await load(true);
      if (photoProblem) setError(photoProblem);
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

  const onPhotoGuarantee = (g) => {
    startDraft(`Foto de la garantía: ${g.article}`, (file) =>
      uploadOrQueue({
        key: "draft",
        run: () => uploadGuaranteePhoto(session.token, g.id, file),
        queueItem: {
          type: "GUARANTEE_PHOTO",
          label: `Foto de garantía #${g.id}`,
          payload: { guaranteeId: g.id, file },
        },
        queuedMessage: "La foto se guardó en el equipo y se subirá sola cuando vuelva la señal.",
      }),
    );
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

        <Modal
          visible={showAddGuarantee}
          onDismiss={() => setShowAddGuarantee(false)}
          contentContainerStyle={styles.modal}
        >
          <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
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
          {canPhotoGuarantee && (
            <View style={{ marginTop: SPACING.md }}>
              <Text style={styles.title}>Fotos de la garantía (opcional)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.xs }}>
                {newPhotos.map((f, i) => (
                  <View key={`${f.uri}-${i}`} style={{ width: 104 }}>
                    <Image source={{ uri: f.uri }} style={{ width: 104, height: 104, borderRadius: RADIUS.md, backgroundColor: COLORS.bg }} resizeMode="cover" />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Button compact onPress={() => replaceNewPhoto(i)} disabled={savingGuarantee} labelStyle={{ fontSize: 11 }}>
                        Cambiar
                      </Button>
                      <Button compact textColor={COLORS.danger} onPress={() => removeNewPhoto(i)} disabled={savingGuarantee} labelStyle={{ fontSize: 11 }}>
                        Quitar
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
              {newPhotos.length < MAX_NEW_PHOTOS && (
                <Button
                  mode="outlined"
                  icon="camera-plus-outline"
                  onPress={addNewPhoto}
                  disabled={savingGuarantee}
                  style={{ marginTop: SPACING.xs, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
                >
                  {newPhotos.length ? "Agregar otra foto" : "Agregar foto"}
                </Button>
              )}
              <Text style={[styles.muted, { marginTop: SPACING.xs }]}>
                Las fotos se pueden cambiar o quitar mientras no guardes. Ya guardada la garantía, quedan definitivas: no se pueden reemplazar ni eliminar desde la app.
              </Text>
            </View>
          )}
          </ScrollView>
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
