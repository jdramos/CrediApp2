import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Chip, ActivityIndicator } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getTrackingDay } from "../api/trackingApi";
import { todayISO, shiftDay } from "../utils/date";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm },
  heroTitle: { color: COLORS.onGradient, fontWeight: "800", flex: 1 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dateText: { color: COLORS.onGradient, fontWeight: "700", minWidth: 130, textAlign: "center" },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  name: { fontWeight: "800", color: COLORS.text, flex: 1 },
  muted: { color: COLORS.muted, fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  warnBox: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  warnTitle: { color: COLORS.warning, fontWeight: "800", flex: 1 },
  warnRow: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  error: { textAlign: "center", color: COLORS.danger, marginTop: SPACING.lg, paddingHorizontal: SPACING.xl },
});

const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—");

// Quién registró su ruta un día, y quién tuvo actividad sin registrarla (el
// mismo aviso de la web). Al tocar a alguien se abre su recorrido en el mapa.
export default function RoutesDayScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        setData(await getTrackingDay(session.token, { date, tz_offset: new Date().getTimezoneOffset() }));
      } catch (e) {
        setData(null);
        setError(e?.message || "No se pudo cargar las rutas. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, date],
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isToday = date === todayISO();
  const users = data?.data || [];
  const without = data?.without_route || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.dark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle}>Rutas del día</Text>
        </View>
        <View style={styles.dateRow}>
          <IconButton icon="chevron-left" iconColor={COLORS.onGradient} onPress={() => setDate(shiftDay(date, -1))} />
          <Text style={styles.dateText}>{isToday ? `Hoy · ${date}` : date}</Text>
          <IconButton
            icon="chevron-right"
            iconColor={COLORS.onGradient}
            disabled={isToday}
            onPress={() => setDate(shiftDay(date, 1))}
          />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {loading && !data ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} /> : null}
        {!!error && <Text style={styles.error}>{error}</Text>}

        {without.length > 0 && (
          <View style={styles.warnBox}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.xs }}>
              <MaterialCommunityIcons name="map-marker-off" size={18} color={COLORS.warning} />
              <Text style={styles.warnTitle}>
                {without.length} cobrador{without.length === 1 ? "" : "es"} con actividad sin ruta registrada
              </Text>
            </View>
            {without.map((u) => (
              <View key={u.user_id} style={styles.warnRow}>
                <Text style={{ color: COLORS.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>{u.user_name}</Text>
                <Text style={styles.muted}>
                  {u.payments_count} pago{u.payments_count === 1 ? "" : "s"} · {u.actions_count} gestion
                  {u.actions_count === 1 ? "" : "es"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {data && users.length === 0 && !loading && <Text style={styles.empty}>Nadie registró su ruta ese día.</Text>}

        {users.map((u) => (
          <Pressable
            key={u.user_id}
            style={styles.card}
            onPress={() => navigation.navigate("RouteMap", { userId: u.user_id, userName: u.user_name, date })}
          >
            <View style={styles.cardTop}>
              <Text style={styles.name} numberOfLines={1}>{u.user_name}</Text>
              <MaterialCommunityIcons name="map-outline" size={20} color={COLORS.primary} />
            </View>
            {!!(u.collector_name || u.branch_name) && (
              <Text style={styles.muted} numberOfLines={1}>
                {[u.collector_name, u.branch_name].filter(Boolean).join(" · ")}
              </Text>
            )}
            <View style={styles.chips}>
              <Chip compact>{`${hhmm(u.first_ms)} – ${hhmm(u.last_ms)}`}</Chip>
              <Chip compact icon="map-marker-distance">{`${u.distance_km} km`}</Chip>
              <Chip compact>{`${u.stops_count} paradas`}</Chip>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
