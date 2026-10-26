import React, { useContext, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, Snackbar } from "react-native-paper";
import * as Location from "expo-location";
import { SessionContext } from "../auth/SessionContext";
import { getCustomer, saveCustomerLocation } from "../api/customerApi";
import { isNetworkError } from "../api/credimasterClient";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import { confirmAction } from "../utils/confirm";
import { openDirectionsTo } from "../utils/maps";
import PlaceMap from "../components/PlaceMap";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110 },
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
});

const formatCoords = (lat, lng) =>
  lat != null && lng != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : "Sin ubicación fijada";

// Captura la ubicación GPS de casa y/o negocio del cliente y la guarda
// en CrediMaster (PUT /api/customer/:id) — requiere clientes.ver para
// cargar el cliente y clientes.editar para guardarlo. El backend espera
// el objeto customer COMPLETO en cada PUT, así que primero se trae el
// registro entero y solo se cambian los 4 campos de coordenadas.
export default function CustomerLocationScreen({ route }) {
  const { customerId } = route.params;
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();

  const [customer, setCustomer] = useState(null);
  const [homeLat, setHomeLat] = useState(null);
  const [homeLng, setHomeLng] = useState(null);
  const [businessLat, setBusinessLat] = useState(null);
  const [businessLng, setBusinessLng] = useState(null);

  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(null); // "home" | "business" | null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [snackbar, setSnackbar] = useState("");
  const [focusKey, setFocusKey] = useState(null); // lugar en el que se centra el mapa

  // Lugares con ubicación (guardada o recién capturada, aunque todavía no se guarde).
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
        const res = await getCustomer(session.token, customerId);
        const c = res?.data?.customer;
        setCustomer(c);
        setHomeLat(c?.home_lat != null ? Number(c.home_lat) : null);
        setHomeLng(c?.home_lng != null ? Number(c.home_lng) : null);
        setBusinessLat(c?.business_lat != null ? Number(c.business_lat) : null);
        setBusinessLng(c?.business_lng != null ? Number(c.business_lng) : null);
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

  const saveLocation = async () => {
    setError("");
    // Nota: el backend reemplaza el registro COMPLETO del cliente en cada
    // PUT (ver customerApi.js::saveCustomerLocation). Si esto se encola sin
    // conexión y otra persona edita al mismo cliente antes de que vuelva la
    // señal, la sincronización posterior pisará esos cambios -- riesgo
    // aceptado igual que en el resto de la cola offline, no hay
    // reconciliación de conflictos en esta versión.
    const location = { home_lat: homeLat, home_lng: homeLng, business_lat: businessLat, business_lng: businessLng };
    try {
      setSaving(true);
      await saveCustomerLocation(session.token, customerId, customer, location);
      setSnackbar("Ubicación guardada");
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await enqueue({
            type: "CUSTOMER_LOCATION",
            label: `Ubicación — ${customer?.customer_name || "cliente"}`,
            payload: { customerId, fullCustomer: customer, location },
          });
          refreshPendingCount();
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
          {customer?.customer_name || "Cliente"}
        </Text>
        <Text style={styles.sub}>Cédula: {customer?.identification || "-"}</Text>

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
          disabled={saving || capturing !== null}
          style={styles.saveBtn}
          contentStyle={{ height: 46 }}
          labelStyle={{ fontWeight: "700" }}
        >
          Guardar ubicación
        </Button>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar("")} duration={2500}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}
