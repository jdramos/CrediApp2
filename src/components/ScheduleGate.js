import React, { useContext, useEffect, useRef, useState } from "react";
import { AppState, Modal, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { SessionContext } from "../auth/SessionContext";
import { useSync } from "../offline/SyncProvider";
import { getMyAppSchedule } from "../api/sessionApi";
import { setOutsideScheduleHandler } from "../api/credimasterClient";
import { evaluateSchedule, outsideMessage } from "../utils/appSchedule";
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
  hint: { color: COLORS.muted, textAlign: "center", fontSize: 12 },
  actions: { alignSelf: "stretch", gap: SPACING.sm, marginTop: SPACING.md },
  button: { borderRadius: RADIUS.md },
});

// Cada cuánto se vuelve a preguntar al servidor por el horario (puede cambiar desde la web).
const SYNC_MS = 60000;
// Cada cuánto se reevalúa si ya es (o ya dejó de ser) hora de usar la app, sin red.
const TICK_MS = 15000;

// Pantallas que SÍ se pueden usar fuera de horario: enviar lo pendiente y el cierre del día.
const ALLOWED_ROUTES = ["PendingSync", "DayClose"];

// Fuera del horario de uso de la app (Usuarios → Horario de uso de la app, en la web)
// tapa toda la app con un aviso. Solo deja enviar lo que quedó pendiente sin señal y
// hacer el cierre del día. Sin horario configurado, no hace nada. El servidor también
// lo exige (403 OUTSIDE_SCHEDULE), esto es para avisar bien y a tiempo.
export default function ScheduleGate({ routeName, onOpenRoute }) {
  const { session, setSession, signOut } = useContext(SessionContext);
  const { pendingCount, syncing, syncNow } = useSync();
  const token = session?.token;
  const windows = session?.user?.app_schedule?.windows || [];
  const [, setTick] = useState(0);
  const [serverBlocked, setServerBlocked] = useState(false);
  const [checking, setChecking] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Trae el horario vigente del servidor y lo guarda en la sesión.
  const sync = async () => {
    if (!token) return;
    try {
      const res = await getMyAppSchedule(token);
      const current = sessionRef.current;
      setServerBlocked(res?.restricted ? !res.allowed : false);
      if (!current) return;
      const next = { restricted: !!res?.restricted, allowed: !!res?.allowed, windows: res?.windows || [] };
      const prev = current.user?.app_schedule;
      if (JSON.stringify(prev?.windows || []) === JSON.stringify(next.windows) && !!prev?.restricted === next.restricted) return;
      const updated = { ...current, user: { ...current.user, app_schedule: next } };
      setSession(updated);
      await saveSession(updated);
    } catch {
      // sin red o error del servidor: se conserva lo último que se sabe
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    sync();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") sync();
    });
    const syncTimer = setInterval(sync, SYNC_MS);
    const tickTimer = setInterval(() => setTick((t) => t + 1), TICK_MS);
    // Una ruta respondió 403 OUTSIDE_SCHEDULE: el servidor dice que no es hora.
    setOutsideScheduleHandler(() => {
      setServerBlocked(true);
      sync();
    });
    return () => {
      sub.remove();
      clearInterval(syncTimer);
      clearInterval(tickTimer);
      setOutsideScheduleHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const status = evaluateSchedule(windows);
  // Sin horario configurado nunca se bloquea (aunque un 403 viejo haya quedado marcado).
  const blocked = status.restricted && (!status.allowed || serverBlocked);
  if (!session || !blocked || ALLOWED_ROUTES.includes(routeName)) return null;

  const recheck = async () => {
    setChecking(true);
    try {
      await sync();
    } finally {
      setChecking(false);
    }
  };

  const canCloseDay = !!session.user?.collector_id;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="clock-alert-outline" size={52} color={COLORS.warning} />
          </View>
          <Text variant="headlineSmall" style={styles.title}>Fuera de tu horario</Text>
          <Text style={styles.text}>{outsideMessage(status)}</Text>
          <Text style={styles.hint}>
            Por ahora solo podés enviar lo que quedó pendiente de sincronizar y hacer el cierre del día.
          </Text>

          <View style={styles.actions}>
            {pendingCount > 0 && (
              <Button mode="contained" icon="cloud-upload-outline" onPress={syncNow} loading={syncing} disabled={syncing} style={styles.button} contentStyle={{ height: 48 }}>
                {`Enviar pendientes (${pendingCount})`}
              </Button>
            )}
            {canCloseDay && (
              <Button mode={pendingCount > 0 ? "outlined" : "contained"} icon="cash-register" onPress={() => onOpenRoute?.("DayClose")} style={styles.button} contentStyle={{ height: 48 }}>
                Hacer el cierre del día
              </Button>
            )}
            <Button mode="outlined" icon="refresh" onPress={recheck} loading={checking} disabled={checking} style={styles.button}>
              Verificar de nuevo
            </Button>
            <Button onPress={() => signOut()} textColor={COLORS.muted}>
              Cerrar sesión
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
