import React, { useCallback, useContext, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Image, Alert, Pressable } from "react-native";
import { Text, TextInput, Button, ActivityIndicator, HelperText, Portal, Modal } from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { isNetworkError } from "../api/credimasterClient";
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
import KeyboardAwareScroll from "./KeyboardAwareScroll";
import GuaranteeExtraFields, { guaranteeExtraPayload, guaranteeExtraSummary } from "./GuaranteeExtraFields";
import useKeyboardModalStyle from "./useKeyboardModalStyle";

// Garantías del cliente (listar, agregar con fotos, editar y agregar fotos), como un bloque que se puede
// poner dentro de cualquier pantalla: la de «Garantías del cliente» (CustomerFileScreen) y la de
// «Evaluación y garantías» de Actualizar cliente (CustomerEvaluationScreen con withGuarantees), para
// que el gestor haga las dos cosas sin salir de la pantalla (dueño, 2026-11-26).
// Usa los mismos endpoints y la misma cola sin conexión que antes (GUARANTEE_PHOTO en offline/syncManager.js).
// `onChanged` avisa a la pantalla que la contiene cada vez que se guardó algo (garantía, edición o foto).

const MAX_NEW_PHOTOS = 6;

const styles = StyleSheet.create({
  sectionTitle: { fontWeight: "800", color: COLORS.text, marginTop: SPACING.sm },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  title: { color: COLORS.text, fontWeight: "700", flex: 1 },
  muted: { color: COLORS.muted, fontSize: 12 },
  actions: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs, flexWrap: "wrap" },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs },
  thumb: { width: 72, height: 72, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff" },
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "92%" },
  viewerImage: { width: "100%", height: 320, borderRadius: RADIUS.md, backgroundColor: "#fff" },
});

// ¿Este usuario ve algo de las garantías? (lo usan las pantallas para decidir si muestran la sección).
export const canUseGuarantees = (perms = []) =>
  perms.includes("garantias.ver") || perms.includes("clientes.editar") || perms.includes("garantias.insertar");

export default function GuaranteesPanel({ customerId, onChanged, title = "Garantías" }) {
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();
  const guaranteeModalStyle = useKeyboardModalStyle(styles.modal);
  // El aviso va por referencia: una función nueva en cada render de la pantalla no debe volver a cargar la lista.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const perms = session?.permissions || [];
  const canSeeGuarantees = perms.includes("garantias.ver");
  const canPhotoGuarantee = perms.includes("garantias.insertar");
  // Crear una garantía es, en el backend, un PUT del cliente (ver saveCustomerGuarantees),
  // por eso pide clientes.editar y no garantias.insertar.
  const canCreateGuarantee = perms.includes("clientes.editar");

  const [guarantees, setGuarantees] = useState([]);
  const [photos, setPhotos] = useState({}); // { [guaranteeId]: [{ id, url }] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // clave de lo que se está subiendo
  const [viewer, setViewer] = useState(null); // { title, url }
  // Foto de una garantía ya guardada, elegida pero todavía NO guardada: se puede cambiar por otra antes de
  // guardarla «definitivamente». Una vez guardada ya no se puede reemplazar ni eliminar desde la app.
  const [draft, setDraft] = useState(null); // { title, file, save(file) }
  const [showAddGuarantee, setShowAddGuarantee] = useState(false);
  const [savingGuarantee, setSavingGuarantee] = useState(false);
  const [newArticle, setNewArticle] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newSeries, setNewSeries] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newExtra, setNewExtra] = useState({}); // modelo, color, años de uso, estado y ubicación (como la web)
  // Fotos de la garantía que se está creando (todavía sin guardar: se pueden cambiar o quitar).
  const [newPhotos, setNewPhotos] = useState([]);
  // Edición de una garantía ya guardada (corregir artículo, marca, serie, valor y datos opcionales).
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ article: "", brand: "", series: "", value: "" });
  const [editExtra, setEditExtra] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const load = useCallback(
    async (notify = false) => {
      setError("");
      try {
        const gs = canSeeGuarantees ? await getCustomerGuarantees(session.token, customerId) : [];
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
        if (notify && onChangedRef.current) onChangedRef.current();
      } catch (e) {
        setError(e?.message || "No se pudieron cargar las garantías. Revisá tu conexión.");
      } finally {
        setLoading(false);
      }
    },
    [session.token, customerId, canSeeGuarantees],
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Sube (o encola si no hay señal) y devuelve "sent" | "queued" | null.
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

  // Foto de una garantía ya guardada: elegir (cámara o galería), revisarla y guardarla.
  const startDraft = async (draftTitle, save) => {
    const file = await pick();
    if (!file) return;
    setError("");
    setDraft({ title: draftTitle, file, save });
  };
  const replaceDraftPhoto = async () => {
    const file = await pick();
    if (file) setDraft((d) => (d ? { ...d, file } : d));
  };
  const confirmDraft = async () => {
    const d = draft;
    if (!d) return;
    const result = await d.save(d.file);
    if (result) {
      setDraft(null);
      if (result === "sent") load(true);
    }
  };

  // Mismo guardado que la pantalla de nueva solicitud: el backend espera la lista COMPLETA de garantías del
  // cliente (existentes + la nueva) dentro de un PUT del cliente completo.
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
        ...guaranteeExtraPayload(newExtra),
      };
      await saveCustomerGuarantees(session.token, customerId, fullCustomer, [...existing, created]);

      // Las fotos se suben a la garantía recién creada: se busca su id entre las del cliente (la que no estaba
      // antes). La garantía ya quedó guardada, así que si una foto falla NO se vuelve a crear; se avisa y se
      // puede subir desde su tarjeta.
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
      setNewExtra({});
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

  const openEditGuarantee = (g) => {
    setEditError("");
    setEditForm({
      article: g.article || "",
      brand: g.brand || "",
      series: g.series || "",
      value: g.value ? String(Number(g.value)) : "",
    });
    setEditExtra({
      model: g.model || "",
      color: g.color || "",
      years_of_use: g.years_of_use || "",
      condition_code: g.condition_code || "",
      location: g.location || "",
    });
    setEditing(g);
  };

  // El servidor recibe la lista COMPLETA de garantías del cliente: las demás van tal cual (sin tocar sus datos
  // opcionales) y la editada va con todos sus campos, también los opcionales vacíos (así se pueden borrar).
  const saveEditGuarantee = async () => {
    if (!editing) return;
    if (!editForm.article.trim() && !editForm.brand.trim() && !toNumber(editForm.value)) {
      setEditError("Deje al menos el artículo, la marca o el valor de la garantía.");
      return;
    }
    try {
      setSavingEdit(true);
      setEditError("");
      const fullRes = await getCustomer(session.token, customerId);
      const fullCustomer = fullRes?.data?.customer;
      const payload = guarantees.map((g) =>
        g.id === editing.id
          ? {
              id: g.id,
              article: editForm.article.trim(),
              series: editForm.series.trim(),
              brand: editForm.brand.trim(),
              // Ligada a un crédito vigente: el valor no cambia (el servidor también lo exige).
              value: g.is_committed ? g.value : toNumber(editForm.value) || null,
              model: (editExtra.model || "").trim(),
              color: (editExtra.color || "").trim(),
              years_of_use: (editExtra.years_of_use || "").trim(),
              condition_code: editExtra.condition_code || "",
              location: editExtra.location || "",
            }
          : { id: g.id, article: g.article, series: g.series, brand: g.brand, value: g.value },
      );
      await saveCustomerGuarantees(session.token, customerId, fullCustomer, payload);
      setEditing(null);
      await load(true);
    } catch (e) {
      setEditError(e?.message ?? "No se pudo guardar la garantía");
    } finally {
      setSavingEdit(false);
    }
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

  if (!canUseGuarantees(perms)) return null;

  return (
    <View style={{ gap: SPACING.md }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!error && <HelperText type="error" visible>{error}</HelperText>}
      {loading && <ActivityIndicator color={COLORS.primary} />}

      {!loading && (
        <>
          {!canSeeGuarantees && (
            <Text style={styles.muted}>Su rol no puede ver las garantías ya registradas; solo agregar nuevas.</Text>
          )}
          {!canPhotoGuarantee && (
            <Text style={[styles.muted, { color: COLORS.warning, fontWeight: "700" }]}>
              Su rol no tiene permiso para tomar fotos de garantías (garantias.insertar). Pídaselo al administrador.
            </Text>
          )}
          {canSeeGuarantees && guarantees.length === 0 && <Text style={styles.muted}>Este cliente no tiene garantías registradas.</Text>}
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
                {!!guaranteeExtraSummary(g) && <Text style={styles.muted}>{guaranteeExtraSummary(g)}</Text>}
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
                {(canPhotoGuarantee || canCreateGuarantee) && (
                  <View style={styles.actions}>
                    {canPhotoGuarantee && (
                      <Button compact mode="contained" icon="camera-plus-outline" onPress={() => onPhotoGuarantee(g)} disabled={busy !== null}>
                        Agregar foto
                      </Button>
                    )}
                    {canCreateGuarantee && (
                      <Button compact mode="outlined" icon="pencil-outline" onPress={() => openEditGuarantee(g)} disabled={busy !== null}>
                        Editar
                      </Button>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

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
            {!!draft?.file && (
              <View style={{ marginTop: SPACING.sm }}>
                <Image source={{ uri: draft.file.uri }} style={styles.viewerImage} resizeMode="contain" />
                <View style={{ flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs }}>
                  <Button compact icon="camera-retake-outline" onPress={replaceDraftPhoto} disabled={busy !== null}>
                    Tomar / elegir otra
                  </Button>
                </View>
              </View>
            )}
          </ScrollView>
          <Text style={[styles.muted, { marginTop: SPACING.sm }]}>
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

        <Modal visible={showAddGuarantee} onDismiss={() => setShowAddGuarantee(false)} contentContainerStyle={guaranteeModalStyle}>
          <KeyboardAwareScroll style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
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
            <GuaranteeExtraFields value={newExtra} onChange={setNewExtra} disabled={savingGuarantee} />
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
          </KeyboardAwareScroll>
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

        <Modal visible={!!editing} onDismiss={() => !savingEdit && setEditing(null)} contentContainerStyle={guaranteeModalStyle}>
          <KeyboardAwareScroll style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
            <Text variant="titleMedium" style={[styles.title, { marginBottom: SPACING.sm }]}>Editar garantía</Text>
            <TextInput
              mode="outlined"
              label="Artículo"
              value={editForm.article}
              onChangeText={(t) => setEditForm((f) => ({ ...f, article: t }))}
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
            <TextInput
              mode="outlined"
              label="Marca (opcional)"
              value={editForm.brand}
              onChangeText={(t) => setEditForm((f) => ({ ...f, brand: t }))}
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
            <TextInput
              mode="outlined"
              label="Serie (opcional)"
              value={editForm.series}
              onChangeText={(t) => setEditForm((f) => ({ ...f, series: t }))}
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
            <TextInput
              mode="outlined"
              label="Valor estimado"
              value={editForm.value}
              onChangeText={(t) => setEditForm((f) => ({ ...f, value: t }))}
              keyboardType="decimal-pad"
              disabled={!!editing?.is_committed}
              style={{ backgroundColor: COLORS.card }}
              outlineStyle={{ borderRadius: RADIUS.md }}
              left={<TextInput.Icon icon="cash" />}
            />
            {!!editing?.is_committed && (
              <Text style={[styles.muted, { marginTop: SPACING.xs }]}>
                El valor no se puede cambiar: la garantía está en uso por un crédito vigente.
              </Text>
            )}
            <GuaranteeExtraFields value={editExtra} onChange={setEditExtra} disabled={savingEdit} />
            <HelperText type="error" visible={!!editError}>{editError}</HelperText>
          </KeyboardAwareScroll>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACING.xs, marginTop: SPACING.sm }}>
            <Button onPress={() => setEditing(null)} disabled={savingEdit}>Cancelar</Button>
            <Button mode="contained" onPress={saveEditGuarantee} loading={savingEdit} disabled={savingEdit}>
              Guardar cambios
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}
