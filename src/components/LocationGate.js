import React, { useContext, useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Platform, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { SessionContext } from "../auth/SessionContext";
import { useLocationAccess } from "../location/useLocationAccess";
import { getLocationPolicy } from "../api/locationApi";
import { saveSession } from "../storage/session";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl, gap: SPACING.md },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.warningSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontWeight: "800", color: COLORS.text, textAlign: "center" },
  text: { color: COLORS.muted, textAlign: "center" },
  detail: { color: COLORS.danger, textAlign: "center", fontSize: 12 },
  actions: { alignSelf: "stretch", gap: SPACING.sm, marginTop: SPACING.md },
  button: { borderRadius: RADIUS.md },
});

// Cada cuánto se vuelve a preguntar al servidor si el usuario tiene excepción.
const POLICY_SYNC_MS = 60000;

const COPY = {
  denied: {
    title: "Activá tu ubicación",
    text: "CrediApp necesita tu ubicación para que puedas registrar pagos, visitas y demás operaciones. Sin ubicación no se puede usar la app.",
  },
  blocked: {
    title: "La ubicación está bloqueada",
    text: Platform.OS === "web"
      ? "El navegador tiene bloqueada la ubicación para este sitio. Permitila desde el candado junto a la dirección y verificá de nuevo."
      : "Negaste el permiso de ubicación. Abrí los ajustes de CrediApp, entrá a Permisos → Ubicación y elegí \"Permitir\" mientras usás la app.",
  },
  "services-off": {
    title: "Encendé la ubicación del teléfono",
    text: Platform.OS === "ios"
      ? "La ubicación del iPhone está apagada. Encendela en Ajustes → Privacidad y seguridad → Localización."
      : "La ubicación (GPS) del dispositivo está apagada. Encendela para seguir usando la app.",
  },
  error: {
    title: "No se pudo comprobar la ubicación",
    text: "Revisá que la ubicación esté permitida y encendida, y verificá de nuevo.",
  },
};

// Bloquea TODA la app mientras el usuario no tenga la ubicación activa
// (permiso concedido y ubicación del dispositivo encendida). Es una ventana
// nativa por encima de todo (pantallas, diálogos y teclado), sin botón para
// cerrarla: solo se va cuando la ubicación queda activa. La única salida es
// cerrar la sesión. Se vuelve a evaluar al volver a la app y cada pocos segundos.
//
// Quien tenga una excepción (Usuarios → Ubicación en la app, en la web) queda
// exento: la marca viene en el login y se mantiene al día preguntando al
// servidor al abrir, al volver a la app y cada minuto. Sin red se usa la última
// que se conoce.
export default function LocationGate() {
  const { session, setSession, signOut } = useContext(SessionContext);
  const exempt = !!session?.user?.location_exempt;
  const { state, detail, refresh, requestPermission, enableServices } = useLocationAccess({ enabled: !exempt });
  const [busy, setBusy] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const token = session?.token;

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    const sync = async () => {
      try {
        const res = await getLocationPolicy(token);
        const next = !!res?.location_exempt;
        const current = sessionRef.current;
        if (!alive || !current || next === !!current.user?.location_exempt) return;
        const updated = { ...current, user: { ...current.user, location_exempt: next } };
        setSession(updated);
        await saveSession(updated);
      } catch {
        // sin red o error del servidor: se conserva lo último que se sabe
      }
    };
    sync();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") sync();
    });
    const timer = setInterval(sync, POLICY_SYNC_MS);
    return () => {
      alive = false;
      sub.remove();
      clearInterval(timer);
    };
  }, [token, setSession]);

  if (state === "ok") return null;

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const openSettings = () => Linking.openSettings().catch(() => {});

  // Qué hace el botón principal en cada estado.
  const primary = (() => {
    if (state === "denied") return { label: "Permitir ubicación", icon: "map-marker-check", onPress: () => run(requestPermission) };
    if (state === "blocked" && Platform.OS !== "web") return { label: "Abrir ajustes", icon: "cog-outline", onPress: openSettings };
    if (state === "services-off") {
      return Platform.OS === "android"
        ? { label: "Encender ubicación", icon: "crosshairs-gps", onPress: () => run(enableServices) }
        : Platform.OS === "web"
          ? null
          : { label: "Abrir ajustes", icon: "cog-outline", onPress: openSettings };
    }
    return null;
  })();

  if (state === "checking") {
    return (
      <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => {}}>
        <View style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </Modal>
    );
  }

  const copy = COPY[state] || COPY.error;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={52} color={COLORS.warning} />
          </View>
          <Text variant="headlineSmall" style={styles.title}>{copy.title}</Text>
          <Text style={styles.text}>{copy.text}</Text>
          {!!detail && <Text style={styles.detail}>{detail}</Text>}

          <View style={styles.actions}>
            {primary && (
              <Button mode="contained" icon={primary.icon} onPress={primary.onPress} loading={busy} disabled={busy} style={styles.button} contentStyle={{ height: 48 }}>
                {primary.label}
              </Button>
            )}
            <Button mode="outlined" icon="refresh" onPress={() => run(refresh)} disabled={busy} style={styles.button}>
              Ya la activé, verificar
            </Button>
            <Button onPress={() => signOut()} disabled={busy} textColor={COLORS.muted}>
              Cerrar sesión
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
