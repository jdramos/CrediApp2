import React, { useCallback, useContext, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Chip, ActivityIndicator } from "react-native-paper";
import RouteMapView from "../components/RouteMapView";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getTrackingUserDay } from "../api/trackingApi";
import { money } from "../utils/format";
import { todayISO, shiftDay } from "../utils/date";
import { resultLabel } from "../utils/collectionsCatalog";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const KIND_COLOR = {
  start: "#16A34A",
  end: "#EF4444",
  stop: "#F59E0B",
  visit: "#1D4ED8",
  payment: "#7C3AED",
};
const LEGEND = [
  ["start", "Inicio"],
  ["end", "Último punto"],
  ["stop", "Parada"],
  ["visit", "Visita"],
  ["payment", "Pago"],
];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dateText: { color: COLORS.text, fontWeight: "700", minWidth: 130, textAlign: "center" },
  map: { height: 330, marginHorizontal: SPACING.md, borderRadius: RADIUS.md, overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, paddingHorizontal: SPACING.md, marginTop: SPACING.sm },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, paddingHorizontal: SPACING.md, marginTop: SPACING.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: COLORS.muted, fontSize: 11 },
  list: { padding: SPACING.md, paddingBottom: 110, gap: SPACING.xs },
  listTitle: { fontWeight: "800", color: COLORS.text, marginTop: SPACING.xs },
  event: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    ...SHADOW.card,
  },
  eventTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  eventTime: { fontWeight: "800", color: COLORS.text, fontSize: 12 },
  eventTitle: { color: COLORS.text, flex: 1 },
  muted: { color: COLORS.muted, fontSize: 12 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  error: { textAlign: "center", color: COLORS.danger, marginTop: SPACING.lg, paddingHorizontal: SPACING.xl },
});

const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—");

// Ruta del día de UN usuario en el mapa (la misma información que "Rutas del
// día" de la web): recorrido, paradas, visitas y pagos. Permiso rastreo.ver;
// el backend limita los usuarios a las sucursales del que consulta.
export default function RouteMapScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const { session } = useContext(SessionContext);
  const [date, setDate] = useState(params.date || todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mapRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getTrackingUserDay(session.token, params.userId, { date, tz_offset: new Date().getTimezoneOffset() }));
    } catch (e) {
      setData(null);
      setError(e?.message || "No se pudo cargar la ruta. Revisá tu conexión.");
    } finally {
      setLoading(false);
    }
  }, [session.token, params.userId, date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const path = useMemo(() => (data?.route || []).map((p) => ({ latitude: p.lat, longitude: p.lng })), [data]);

  // Eventos de la jornada ordenados por hora (línea de tiempo + marcadores).
  const events = useMemo(() => {
    if (!data) return [];
    const list = [];
    if (data.route?.length) {
      const first = data.route[0];
      const last = data.route[data.route.length - 1];
      list.push({ key: "start", t: first.t_ms, kind: "start", title: "Inicio del recorrido", lat: first.lat, lng: first.lng });
      list.push({ key: "end", t: last.t_ms, kind: "end", title: "Último punto registrado", lat: last.lat, lng: last.lng });
    }
    (data.stops || []).forEach((s, i) =>
      list.push({
        key: `stop-${i}`,
        t: s.start_ms,
        kind: "stop",
        title: `Parada de ${s.minutes} min`,
        subtitle: `${hhmm(s.start_ms)} a ${hhmm(s.end_ms)}`,
        lat: s.lat,
        lng: s.lng,
      }),
    );
    (data.visits || []).forEach((v) =>
      list.push({
        key: `visit-${v.id}`,
        t: v.t_ms,
        kind: "visit",
        title: `Visita: ${v.customer_name || `Crédito ${v.credit_code}`}`,
        subtitle: resultLabel(v.result) || "",
        lat: v.lat,
        lng: v.lng,
      }),
    );
    (data.payments || []).forEach((p) =>
      list.push({
        key: `pay-${p.id}`,
        t: p.t_ms,
        kind: "payment",
        title: `Pago ${money(p.amount)}: ${p.customer_name || `Crédito ${p.credit_code}`}`,
        subtitle: p.lat == null ? "Sin ubicación en la ruta a esa hora" : "",
        lat: p.lat,
        lng: p.lng,
      }),
    );
    return list.sort((a, b) => a.t - b.t);
  }, [data]);

  const markers = useMemo(
    () =>
      events
        .filter((e) => e.lat != null)
        .map((e) => ({
          key: e.key,
          lat: e.lat,
          lng: e.lng,
          color: KIND_COLOR[e.kind],
          title: `${hhmm(e.t)} · ${e.title}`,
          description: e.subtitle || undefined,
        })),
    [events],
  );

  const focus = (e) => {
    if (e.lat != null) mapRef.current?.focus(e.lat, e.lng);
  };

  const isToday = date === todayISO();
  const s = data?.summary;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
          {params.userName || data?.user?.name || "Ruta del día"}
        </Text>
      </View>
      <View style={styles.dateRow}>
        <IconButton icon="chevron-left" onPress={() => setDate(shiftDay(date, -1))} />
        <Text style={styles.dateText}>{isToday ? `Hoy · ${date}` : date}</Text>
        <IconButton icon="chevron-right" disabled={isToday} onPress={() => setDate(shiftDay(date, 1))} />
      </View>

      {loading && !data ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} /> : null}
      {!!error && <Text style={styles.error}>{error}</Text>}

      {data && path.length === 0 && !loading && (
        <Text style={styles.empty}>Esta persona no registró ruta ese día.</Text>
      )}

      {data && path.length > 0 && (
        <>
          <RouteMapView ref={mapRef} style={styles.map} path={path} markers={markers} />

          <View style={styles.chips}>
            <Chip compact>{`${hhmm(s.first_ms)} – ${hhmm(s.last_ms)}`}</Chip>
            <Chip compact icon="map-marker-distance">{`${s.distance_km} km`}</Chip>
            <Chip compact>{`${s.stops_count} paradas`}</Chip>
            <Chip compact>{`${s.visits_count} visitas`}</Chip>
            <Chip compact>{`${s.payments_count} pagos`}</Chip>
          </View>
          <View style={styles.legend}>
            {LEGEND.map(([k, label]) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: KIND_COLOR[k] }]} />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            <Text style={styles.listTitle}>Línea de tiempo</Text>
            {events.map((e) => (
              <Pressable key={e.key} style={styles.event} onPress={() => focus(e)}>
                <View style={styles.eventTop}>
                  <View style={[styles.dot, { backgroundColor: KIND_COLOR[e.kind] }]} />
                  <Text style={styles.eventTime}>{hhmm(e.t)}</Text>
                  <Text style={styles.eventTitle}>{e.title}</Text>
                </View>
                {!!e.subtitle && <Text style={[styles.muted, { marginLeft: 22 }]}>{e.subtitle}</Text>}
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}
