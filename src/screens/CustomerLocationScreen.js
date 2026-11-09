import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Alert, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, Snackbar } from "react-native-paper";
import * as Location from "expo-location";
import { SessionContext } from "../auth/SessionContext";
import { getCustomer, saveCustomerLocation } from "../api/customerApi";
import { uploadCustomerDocument } from "../api/customerDocumentApi";
import { isNetworkError } from "../api/credimasterClient";
import { enqueue } from "../offline/queue";
import { persistLocalFile } from "../offline/filePersist";
import { useSync } from "../offline/SyncProvider";
import { isLocalCustomerId, resolveCustomerId, getQueuedCustomerFields, patchQueuedCustomer } from "../offline/localCustomers";
import { confirmAction } from "../utils/confirm";
import { pickImage } from "../utils/imagePicker";
import { openDirectionsTo } from "../utils/maps";
import PlaceMap from "../components/PlaceMap";
import { COLORS } from "../theme/colors";
import CopyableId from "../components/CopyableId";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import { withCode } from "../utils/customerLabel";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  header: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginTop: SPACING.md,
    ...SHADOW.card,
  },
  cardTitle: { fontWeight: "700", color: COLORS.text },
  coords: { marginTop: SPACING.xs, color: COLORS.muted },
  btn: { marginTop: SPACING.sm, borderRadius: RADIUS.md },
  saveBtn: { marginTop: SPACING.lg, borderRadius: RADIUS.md },
  rowBtns: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.sm },
  mapCard: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: COLORS.card,
    ...SHADOW.card,
  },
  map: { height: 280 },
  legend: { flexDirection: "row", gap: SPACING.md, padding: SPACING.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.sm },
  thumb: { width: 64, height: 64, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff" },
});

// Fotos que se pueden agregar por lugar en una misma visita.
const MAX_PLACE_PHOTOS = 5;
const PHOTO_NAME = { home: "Foto de la casa", business: "Foto del negocio" };

const formatCoords = (lat, lng) =>
  lat != null && lng != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : "Sin ubicación fijada";

// Captura la ubicación GPS de casa y/o negocio del cliente y la guarda
// en CrediMaster (PUT /api/customer/:id) — requiere clientes.ver para
// cargar el cliente y clientes.editar para guardarlo. El backend espera
// el objeto customer COMPLETO en cada PUT, así que primero se trae el
// registro entero y solo se cambian los 4 campos de coordenadas.
//
// Si el cliente se creó sin señal (id "local:...") todavía no existe en el servidor: la ubicación
// se guarda dentro de su alta pendiente y las fotos quedan en la cola apuntando a él.
const CUSTOMER_NOT_REGISTERED = new Error("cliente sin registrar"); // sin status: sigue el camino de "sin señal"
export default function CustomerLocationScreen({ route }) {
  const { customerId } = route.params;
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();

  const [customer, setCustomer] = useState(null);
  // true: `customer` es solo lo escrito en el formulario guardado en el teléfono (incompleto);
  // no sirve para un PUT, que reemplaza el registro completo.
  const partialCustomer = useRef(false);
  const [homeLat, setHomeLat] = useState(null);
  const [homeLng, setHomeLng] = useState(null);
  const [businessLat, setBusinessLat] = useState(null);
  const [businessLng, setBusinessLng] = useState(null);
  // Lo que ya está guardado: "Guardar ubicación" solo se activa si se capturó algo distinto.
  const [saved, setSaved] = useState({ homeLat: null, homeLng: null, businessLat: null, businessLng: null });

  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(null); // "home" | "business" | null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [snackbar, setSnackbar] = useState("");
  const [focusKey, setFocusKey] = useState(null); // lugar en el que se centra el mapa

  // Fotos de la casa / el negocio (fachada, referencias para llegar): se suben al expediente del
  // cliente como documento. `photos` = las agregadas en esta pantalla, con su estado.
  const canUploadPhotos = session?.permissions?.includes("clientes.documentos.subir");
  const [photos, setPhotos] = useState({ home: [], business: [] });
  const [photoBusy, setPhotoBusy] = useState(null); // "home" | "business" | null

  // Lugares con ubicación (guardada o recién capturada, aunque todavía no se guarde).
  const sameCoord = (a, b) => (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));
  const hasLocation = (homeLat != null && homeLng != null) || (businessLat != null && businessLng != null);
  const hasChanges =
    !sameCoord(homeLat, saved.homeLat) || !sameCoord(homeLng, saved.homeLng) ||
    !sameCoord(businessLat, saved.businessLat) || !sameCoord(businessLng, saved.businessLng);
  const canSave = hasLocation && hasChanges;

  const places = useMemo(() => {
    const list = [];
    if (homeLat != null && homeLng != null) list.push({ key: "home", label: "Casa", lat: Number(homeLat), lng: Number(homeLng), color: "#1D4ED8" });
    if (businessLat != null && businessLng != null) list.push({ key: "business", label: "Negocio", lat: Number(businessLat), lng: Number(businessLng), color: "#F59E0B" });
    return list;
  }, [homeLat, homeLng, businessLat, businessLng]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const id = await resolveCustomerId(customerId);
        let c;
        if (isLocalCustomerId(id)) {
          c = await getQueuedCustomerFields(customerId);
          partialCustomer.current = true;
          if (!c) throw new Error("Este cliente ya no está en la lista de pendientes.");
        } else {
          c = (await getCustomer(session.token, id))?.data?.customer;
          partialCustomer.current = false;
        }
        setCustomer(c);
        const loaded = {
          homeLat: c?.home_lat != null ? Number(c.home_lat) : null,
          homeLng: c?.home_lng != null ? Number(c.home_lng) : null,
          businessLat: c?.business_lat != null ? Number(c.business_lat) : null,
          businessLng: c?.business_lng != null ? Number(c.business_lng) : null,
        };
        setHomeLat(loaded.homeLat);
        setHomeLng(loaded.homeLng);
        setBusinessLat(loaded.businessLat);
        setBusinessLng(loaded.businessLng);
        setSaved(loaded);
      } catch (e) {
        setError(e?.message ?? "Error cargando el cliente");
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, session.token]);

  const captureLocation = async (target) => {
    setError("");
    try {
      setCapturing(target);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Se necesita permiso de ubicación para continuar");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (!Number.isFinite(position?.coords?.latitude) || !Number.isFinite(position?.coords?.longitude)) {
        setError("No se pudo leer la ubicación. Revisá que el GPS esté encendido e intentá de nuevo.");
        return;
      }

      if (target === "home") {
        setHomeLat(position.coords.latitude);
        setHomeLng(position.coords.longitude);
      } else {
        setBusinessLat(position.coords.latitude);
        setBusinessLng(position.coords.longitude);
      }
    } catch (e) {
      setError(e?.message ?? "No se pudo obtener la ubicación");
    } finally {
      setCapturing(null);
    }
  };

  // Toma o elige una foto del lugar y la sube al expediente; sin señal queda en la cola y se envía sola.
  const addPlacePhoto = async (target) => {
    setError("");
    let file;
    try {
      file = await pickImage();
    } catch (e) {
      setError(e?.message ?? "No se pudo abrir la cámara o la galería");
      return;
    }
    if (!file) return;
    const options = { docType: "OTRO", docName: PHOTO_NAME[target], relatedItemCode: "OTHER_DOC" };
    setPhotoBusy(target);
    let id = customerId;
    try {
      id = await resolveCustomerId(customerId);
      if (isLocalCustomerId(id)) throw CUSTOMER_NOT_REGISTERED; // va directo a la cola
      await uploadCustomerDocument(session.token, id, file, options);
      setPhotos((p) => ({ ...p, [target]: [...p[target], { uri: file.uri, state: "sent" }] }));
      setSnackbar("Foto guardada en el expediente");
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          const stableUri = await persistLocalFile(file.uri, file.name);
          await enqueue({
            type: "CUSTOMER_DOCUMENT",
            label: `${PHOTO_NAME[target]} — ${customer?.customer_name || "cliente"}`,
            payload: { customerId: id, file: { ...file, uri: stableUri }, options },
          });
          refreshPendingCount();
          setPhotos((p) => ({ ...p, [target]: [...p[target], { uri: file.uri, state: "queued" }] }));
          Alert.alert("Sin conexión", "La foto se guardó en el equipo y se subirá sola cuando vuelva la señal.");
        } catch (queueErr) {
          setError(queueErr?.message ?? "No se pudo guardar la foto para enviarla después");
        }
      } else {
        setError(e?.message ?? "No se pudo subir la foto");
      }
    } finally {
      setPhotoBusy(null);
    }
  };

  const renderPlacePhotos = (target, lat, lng) => {
    if (!canUploadPhotos || lat == null || lng == null) return null;
    const list = photos[target];
    const queued = list.filter((f) => f.state === "queued").length;
    return (
      <View>
        {list.length > 0 && (
          <View style={styles.thumbs}>
            {list.map((f, i) => (
              <Image key={`${f.uri}-${i}`} source={{ uri: f.uri }} style={[styles.thumb, f.state === "queued" && { opacity: 0.5 }]} />
            ))}
          </View>
        )}
        {list.length > 0 && (
          <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
            {`${list.length} foto${list.length === 1 ? "" : "s"} agregada${list.length === 1 ? "" : "s"}${queued ? ` (${queued} por enviar cuando haya señal)` : ""}`}
          </Text>
        )}
        <Button
          mode="outlined"
          icon="camera-outline"
          onPress={() => addPlacePhoto(target)}
          loading={photoBusy === target}
          disabled={photoBusy !== null || list.length >= MAX_PLACE_PHOTOS}
          style={styles.btn}
        >
          {target === "home" ? "Agregar foto de la casa" : "Agregar foto del negocio"}
        </Button>
      </View>
    );
  };

  const saveLocation = async () => {
    setError("");
    // Nota: el backend reemplaza el registro COMPLETO del cliente en cada
    // PUT (ver customerApi.js::saveCustomerLocation). Si esto se encola sin
    // conexión y otra persona edita al mismo cliente antes de que vuelva la
    // señal, la sincronización posterior pisará esos cambios -- riesgo
    // aceptado igual que en el resto de la cola offline, no hay
    // reconciliación de conflictos en esta versión.
    const location = { home_lat: homeLat, home_lng: homeLng, business_lat: businessLat, business_lng: businessLng };
    let id = customerId;
    try {
      setSaving(true);
      id = await resolveCustomerId(customerId);
      if (isLocalCustomerId(id)) {
        // Cliente todavía sin registrar: la ubicación viaja dentro de su alta pendiente.
        const ok = await patchQueuedCustomer(customerId, location);
        if (!ok) {
          setError("El cliente se acaba de registrar. Salga y vuelva a abrir esta pantalla para guardar la ubicación.");
          return;
        }
        setSaved({ homeLat, homeLng, businessLat, businessLng });
        setSnackbar("Ubicación guardada en el teléfono; se enviará con el cliente cuando haya señal");
        return;
      }
      let full = customer;
      if (partialCustomer.current) {
        // Ya se registró mientras tanto: hay que traer su ficha completa antes de guardar.
        full = (await getCustomer(session.token, id))?.data?.customer;
        partialCustomer.current = false;
        setCustomer(full);
      }
      await saveCustomerLocation(session.token, id, full, location);
      setSaved({ homeLat, homeLng, businessLat, businessLng });
      setSnackbar("Ubicación guardada");
    } catch (e) {
      if (isNetworkError(e)) {
        if (partialCustomer.current) {
          setError("Sin conexión. Intente de nuevo en un momento.");
          return;
        }
        try {
          await enqueue({
            type: "CUSTOMER_LOCATION",
            label: `Ubicación — ${customer?.customer_name || "cliente"}`,
            payload: { customerId: id, fullCustomer: customer, location },
          });
          refreshPendingCount();
          setSaved({ homeLat, homeLng, businessLat, businessLng });
          Alert.alert("Sin conexión", "La ubicación se guardó en el equipo y se enviará sola cuando vuelva la señal.");
        } catch (queueErr) {
          setError(queueErr?.message ?? "No se pudo guardar la ubicación para enviarla después");
        }
        return;
      }
      setError(e?.message ?? "Error al guardar la ubicación");
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    if (!canSave) {
      setError("Primero capturá la ubicación de la casa o del negocio.");
      return;
    }
    confirmAction("Guardar ubicación", `¿Guardar la ubicación de ${customer?.customer_name || "este cliente"}?`, saveLocation);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headlineSmall" style={styles.header}>
          {withCode(customer?.customer_name, customer?.customer_code)}
        </Text>
        <CopyableId label="Cédula: " value={customer?.identification} textStyle={styles.sub} />

        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Casa</Text>
          <Text style={styles.coords}>{formatCoords(homeLat, homeLng)}</Text>
          <Button
            mode="outlined"
            icon="crosshairs-gps"
            onPress={() => captureLocation("home")}
            loading={capturing === "home"}
            disabled={capturing !== null || saving}
            style={styles.btn}
          >
            Capturar ubicación actual
          </Button>
          {homeLat != null && homeLng != null && (
            <View style={styles.rowBtns}>
              <Button mode="outlined" icon="map" onPress={() => setFocusKey("home")} style={{ flex: 1, borderRadius: RADIUS.md }}>
                Ver en el mapa
              </Button>
              <Button mode="contained-tonal" icon="map-marker-path" onPress={() => openDirectionsTo(homeLat, homeLng)} style={{ flex: 1, borderRadius: RADIUS.md }}>
                Ir
              </Button>
            </View>
          )}
          {renderPlacePhotos("home", homeLat, homeLng)}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Negocio</Text>
          <Text style={styles.coords}>{formatCoords(businessLat, businessLng)}</Text>
          <Button
            mode="outlined"
            icon="crosshairs-gps"
            onPress={() => captureLocation("business")}
            loading={capturing === "business"}
            disabled={capturing !== null || saving}
            style={styles.btn}
          >
            Capturar ubicación actual
          </Button>
          {businessLat != null && businessLng != null && (
            <View style={styles.rowBtns}>
              <Button mode="outlined" icon="map" onPress={() => setFocusKey("business")} style={{ flex: 1, borderRadius: RADIUS.md }}>
                Ver en el mapa
              </Button>
              <Button mode="contained-tonal" icon="map-marker-path" onPress={() => openDirectionsTo(businessLat, businessLng)} style={{ flex: 1, borderRadius: RADIUS.md }}>
                Ir
              </Button>
            </View>
          )}
          {renderPlacePhotos("business", businessLat, businessLng)}
        </View>

        {places.length > 0 && (
          <View style={styles.mapCard}>
            <PlaceMap places={places} focusKey={focusKey} style={styles.map} />
            <View style={styles.legend}>
              {places.map((p) => (
                <View key={p.key} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: p.color }]} />
                  <Text style={{ color: COLORS.muted, fontSize: 12 }}>{p.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Button
          mode="contained"
          onPress={onSave}
          loading={saving}
          disabled={saving || capturing !== null || !canSave}
          style={styles.saveBtn}
          contentStyle={{ height: 46 }}
          labelStyle={{ fontWeight: "700" }}
        >
          Guardar ubicación
        </Button>
        {!canSave && (
          <HelperText type="info" visible>
            {hasLocation ? "No hay cambios por guardar." : "Primero capturá la ubicación actual de la casa o del negocio."}
          </HelperText>
        )}
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar("")} duration={2500}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}
