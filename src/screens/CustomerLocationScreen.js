import React, { useContext, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, Snackbar } from "react-native-paper";
import * as Location from "expo-location";
import { SessionContext } from "../auth/SessionContext";
import { getCustomer, saveCustomerLocation } from "../api/customerApi";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg },
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

  const onSave = async () => {
    setError("");
    try {
      setSaving(true);
      await saveCustomerLocation(session.token, customerId, customer, {
        home_lat: homeLat,
        home_lng: homeLng,
        business_lat: businessLat,
        business_lng: businessLng,
      });
      setSnackbar("Ubicación guardada");
    } catch (e) {
      setError(e?.message ?? "Error al guardar la ubicación");
    } finally {
      setSaving(false);
    }
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
        </View>

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
