import React, { useContext, useEffect, useState } from "react";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import { DateWheelField } from "../components/DateWheelPicker";
import { View, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, ActivityIndicator, HelperText, Checkbox } from "react-native-paper";
import * as Location from "expo-location";
import { SessionContext } from "../auth/SessionContext";
import { getCustomerInfoUpdate, saveCustomerInfoUpdate } from "../api/customerApi";
import { isNetworkError } from "../api/credimasterClient";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import InfoUpdateBanner from "../components/InfoUpdateBanner";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Actualizar el expediente del cliente en la visita (dueño, 2026-11-05):
// se revisan los datos con el cliente, se corrige lo que cambió y se guarda.
// Guardar sin cambios también cuenta (se confirmaron). Queda de una vez, sin
// aprobación de supervisor. Sin señal se guarda en el equipo y se envía sola.

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.sm },
  header: { fontWeight: "800", color: COLORS.text },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  group: { fontWeight: "800", color: COLORS.muted, fontSize: 12, textTransform: "uppercase" },
  input: { backgroundColor: COLORS.card },
  hint: { color: COLORS.muted, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center" },
});

const GROUPS = [
  ["Contacto", [["cellphone", "Celular", "phone-pad"], ["telephone", "Teléfono", "phone-pad"]]],
  ["Domicilio", [["home_address", "Dirección de domicilio"]]],
  ["Negocio / trabajo", [["business_name", "Nombre del negocio"], ["business_address", "Dirección del negocio"], ["business_telephone", "Teléfono del negocio", "phone-pad"], ["occupation", "Ocupación"]]],
  ["Ingresos mensuales", [["business_monthly_income", "Ingreso del negocio", "decimal-pad"], ["monthly_salary", "Salario", "decimal-pad"], ["other_incomes", "Otros ingresos", "decimal-pad"]]],
  ["Cédula", [["identity_expiration_date", "Vencimiento de la cédula (AAAA-MM-DD)"]]],
  ["Referencias", [
    ["reference_name", "Referencia 1: nombre"], ["reference_telephone", "Referencia 1: teléfono", "phone-pad"],
    ["reference2_name", "Referencia 2: nombre"], ["reference2_telephone", "Referencia 2: teléfono", "phone-pad"],
  ]],
];
const KEYS = GROUPS.flatMap(([, list]) => list.map(([k]) => k));

export default function CustomerInfoUpdateScreen({ route, navigation }) {
  const { customerId, customerName } = route.params;
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(null);
  const [comment, setComment] = useState("");
  const [gps, setGps] = useState(null);
  const [asHome, setAsHome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getCustomerInfoUpdate(session.token, customerId)
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        setStatus(data);
        const f = data.fields || {};
        setForm(Object.fromEntries(KEYS.map((k) => [k, f[k] == null ? "" : k === "identity_expiration_date" ? String(f[k]).slice(0, 10) : String(f[k])])));
      })
      .catch((e) => alive && setError(e?.message ?? "No se pudo cargar el expediente del cliente"));
    return () => {
      alive = false;
    };
  }, [customerId, session.token]);

  const takeLocation = async () => {
    setError("");
    setLocating(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setError("Se necesita permiso de ubicación para registrar dónde se hizo la actualización");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!Number.isFinite(pos?.coords?.latitude)) {
        setError("No se pudo leer la ubicación. Revisá que el GPS esté encendido.");
        return;
      }
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e) {
      setError(e?.message ?? "No se pudo obtener la ubicación");
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    setError("");
    const fields = { ...form };
    if (gps && asHome) {
      fields.home_lat = gps.lat;
      fields.home_lng = gps.lng;
    }
    const payload = { fields, comment: comment.trim() || undefined, lat: gps?.lat, lng: gps?.lng };
    setBusy(true);
    try {
      const res = await saveCustomerInfoUpdate(session.token, customerId, payload);
      Alert.alert("Expediente actualizado", res?.message || "Se guardó la actualización del expediente.");
      navigation.goBack();
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await enqueue({
            type: "CUSTOMER_INFO_UPDATE",
            label: `Actualización de expediente — ${customerName || "cliente"}`,
            payload: { customerId, payload },
          });
          refreshPendingCount();
          Alert.alert("Sin conexión", "La actualización se guardó en el equipo y se enviará sola cuando vuelva la señal.");
          navigation.goBack();
        } catch (queueErr) {
          setError(queueErr?.message ?? "No se pudo guardar para enviarla después");
        }
      } else {
        setError(e?.message ?? "No se pudo guardar la actualización");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!form) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center", padding: SPACING.lg }]}>
        {error ? <HelperText type="error" visible>{error}</HelperText> : <ActivityIndicator />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.content}>
        <Text variant="titleLarge" style={styles.header}>{customerName || "Cliente"}</Text>
        <InfoUpdateBanner status={status} />
        <Text style={styles.hint}>
          Revisá los datos con el cliente, corregí lo que cambió y guardá. Si todo sigue igual, guardá de todos modos: queda
          registrado que se confirmaron.
        </Text>

        {GROUPS.map(([title, list]) => (
          <View key={title} style={styles.card}>
            <Text style={styles.group}>{title}</Text>
            {list.map(([key, label, keyboardType]) => key === "identity_expiration_date" ? (
              <DateWheelField
                key={key}
                dense
                label={label.replace(/\s*\(AAAA-MM-DD\)/, "")}
                value={form[key]}
                onChange={(iso) => setForm((f) => ({ ...f, [key]: iso || "" }))}
                minYear={new Date().getFullYear() - 5}
                maxYear={new Date().getFullYear() + 30}
                style={styles.input}
              />
            ) : (
              <TextInput
                key={key}
                mode="outlined"
                dense
                label={label}
                value={form[key]}
                keyboardType={keyboardType || "default"}
                onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                style={styles.input}
              />
            ))}
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.group}>Ubicación de la visita</Text>
          <Button mode="outlined" icon="crosshairs-gps" loading={locating} disabled={locating} onPress={takeLocation} style={{ borderRadius: RADIUS.md }}>
            {gps ? "Volver a tomar la ubicación" : "Tomar mi ubicación actual"}
          </Button>
          {gps && (
            <>
              <Text style={styles.hint}>{`${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`}</Text>
              <View style={styles.row}>
                <Checkbox status={asHome ? "checked" : "unchecked"} onPress={() => setAsHome((v) => !v)} />
                <Text onPress={() => setAsHome((v) => !v)}>Guardar como ubicación de la casa del cliente</Text>
              </View>
            </>
          )}
        </View>

        <TextInput mode="outlined" label="Comentario (opcional)" value={comment} onChangeText={setComment} multiline style={styles.input} />

        <HelperText type="error" visible={!!error}>{error}</HelperText>
        <Button mode="contained" icon="content-save" onPress={save} loading={busy} disabled={busy} style={{ borderRadius: RADIUS.md }}>
          Guardar actualización
        </Button>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}
