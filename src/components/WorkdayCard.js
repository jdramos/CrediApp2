import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { Text, Button } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  startTracking,
  stopTracking,
  flushTracking,
  resumeTrackingIfActive,
  subscribeTracking,
} from "../tracking/tracker";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const CONSENT_KEY = "TRACKING_CONSENT_V1";

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  top: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  muted: { color: COLORS.muted, fontSize: 12 },
  stats: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.xs },
  stat: { flex: 1 },
  statValue: { color: COLORS.text, fontWeight: "800" },
  error: { color: COLORS.danger, fontSize: 12 },
});

const formatTime = (ms) =>
  ms ? new Date(ms).toLocaleTimeString("es-NI", { hour: "numeric", minute: "2-digit" }) : "—";

const CONSENT_TEXT =
  "Mientras la jornada esté activa, la app registra tu ubicación cada medio minuto aproximadamente y la envía a la empresa.\n\n" +
  "• Tus supervisores con permiso pueden ver tu ruta del día.\n" +
  "• Solo se registra mientras la jornada está iniciada: la empezás y la terminás vos.\n" +
  "• Los puntos se guardan 90 días.\n" +
  "• La app debe estar abierta para registrar (con la pantalla encendida).";

// Tarjeta "Mi jornada" del Inicio: inicia/termina el registro de la ruta del
// día (ver tracking/tracker.js) y muestra cómo va.
export default function WorkdayCard() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = subscribeTracking(setSt);
    // Si la jornada seguía activa al cerrarse la app, se retoma el registro.
    resumeTrackingIfActive().catch(() => {});
    return unsub;
  }, []);

  const doStart = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await startTracking();
      if (!res.ok) {
        setError(
          res.reason === "no-permission"
            ? "Necesito el permiso de ubicación para registrar tu ruta. Activalo en los ajustes del teléfono."
            : "No se pudo iniciar el registro de la ruta.",
        );
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const onStart = async () => {
    let accepted = false;
    try {
      accepted = (await AsyncStorage.getItem(CONSENT_KEY)) === "1";
    } catch {
      // sin almacenamiento: se vuelve a preguntar
    }
    if (accepted) {
      doStart();
      return;
    }
    Alert.alert("Registrar tu ruta del día", CONSENT_TEXT, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Entiendo, iniciar",
        onPress: async () => {
          try {
            await AsyncStorage.setItem(CONSENT_KEY, "1");
          } catch {
            // se volverá a preguntar la próxima vez
          }
          doStart();
        },
      },
    ]);
  };

  const onStop = () => {
    Alert.alert("Terminar jornada", "Se deja de registrar tu ubicación y se envía lo que falte.", [
      { text: "Seguir", style: "cancel" },
      {
        text: "Terminar",
        onPress: async () => {
          setBusy(true);
          try {
            await stopTracking();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const active = !!st?.active;
  const km = ((st?.distanceM || 0) / 1000).toFixed(1);

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <MaterialCommunityIcons
          name={active ? "map-marker-radius" : "map-marker-radius-outline"}
          size={24}
          color={active ? COLORS.success : COLORS.muted}
        />
        <Text variant="titleMedium" style={styles.title}>Mi jornada</Text>
        <Text style={{ color: active ? COLORS.success : COLORS.muted, fontWeight: "700" }}>
          {active ? "En curso" : "Sin iniciar"}
        </Text>
      </View>

      {active ? (
        <>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.muted}>Inicio</Text>
              <Text style={styles.statValue}>{formatTime(st.startedAt)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.muted}>Recorrido</Text>
              <Text style={styles.statValue}>{km} km</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.muted}>Último punto</Text>
              <Text style={styles.statValue}>{formatTime(st.lastPointAt)}</Text>
            </View>
          </View>
          {st.buffered > 0 && (
            <Text style={styles.muted}>
              {st.buffered} punto{st.buffered === 1 ? "" : "s"} por enviar (se envían solos cuando hay señal).
            </Text>
          )}
          <Text style={styles.muted}>Mantené la app abierta para que se registre tu ruta.</Text>
          <View style={{ flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs }}>
            <Button
              mode="outlined"
              icon="cloud-upload-outline"
              onPress={() => flushTracking().catch(() => {})}
              style={{ flex: 1, borderRadius: RADIUS.md }}
            >
              Enviar ahora
            </Button>
            <Button
              mode="contained"
              icon="stop-circle-outline"
              buttonColor={COLORS.danger}
              onPress={onStop}
              loading={busy}
              disabled={busy}
              style={{ flex: 1, borderRadius: RADIUS.md }}
            >
              Terminar
            </Button>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            Iniciá tu jornada para que tu ruta del día quede registrada y tus supervisores puedan verla.
          </Text>
          <Button
            mode="contained"
            icon="play-circle-outline"
            onPress={onStart}
            loading={busy}
            disabled={busy}
            style={{ borderRadius: RADIUS.md, marginTop: SPACING.xs }}
          >
            Iniciar jornada
          </Button>
        </>
      )}
      {!!(error || st?.error) && <Text style={styles.error}>{error || st?.error}</Text>}
    </View>
  );
}
