import React, { useCallback, useContext, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Button, ActivityIndicator } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getMyDayClose } from "../api/collectionsApi";
import { usePendingPayments } from "../offline/pendingPayments";
import { useTenantLogo } from "../hooks/useTenantLogo";
import ShareCardHeader from "../components/ShareCardHeader";
import OfflineNotice from "../components/OfflineNotice";
import { cachedFetch } from "../offline/cache";
import PaymentEvidenceModal from "../components/PaymentEvidenceModal";
import { money } from "../utils/format";
import { todayISO } from "../utils/date";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm },
  heroTitle: { color: COLORS.onGradient, fontWeight: "800", flex: 1 },
  heroLabel: { color: COLORS.onGradientMuted, marginTop: SPACING.sm },
  heroAmount: { color: COLORS.onGradient, fontWeight: "800" },
  heroSub: { color: COLORS.onGradientMuted, marginTop: 2 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: SPACING.xs },
  dateText: { color: COLORS.onGradient, fontWeight: "700", minWidth: 120, textAlign: "center" },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  cardTitle: { fontWeight: "800", color: COLORS.text },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  label: { color: COLORS.muted, flexShrink: 1 },
  value: { color: COLORS.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  muted: { color: COLORS.muted, fontSize: 12 },
  payRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm, paddingVertical: 2 },
  payName: { color: COLORS.text, fontWeight: "600" },
  warn: {
    backgroundColor: COLORS.warningSoft,
    borderColor: COLORS.warning,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  warnText: { color: COLORS.warning, fontWeight: "600" },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
});

// Mueve una fecha YYYY-MM-DD por días sin pasar por zonas horarias (mediodía
// local evita que el cambio de horario o UTC corra el día).
function shiftDay(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function Row({ label, value, color }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

// "Cierre del día" del cobrador: lo cobrado por forma de pago, el efectivo
// que debe entregar y el acumulado en su poder (custodia) que todavía no se
// le liquida en un arqueo o depósito bancario en la oficina.
export default function DayCloseScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const pending = usePendingPayments(date);
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState(null);
  const [cachedAt, setCachedAt] = useState(null);
  const shotRef = useRef(null);
  const logoUrl = useTenantLogo(session?.token);

  const load = useCallback(
    async (isoDate, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const res = await cachedFetch(`${session.user.id}:dayclose:${isoDate}`, () => getMyDayClose(session.token, isoDate));
        setData(res.data);
        setCachedAt(res.cachedAt);
      } catch (e) {
        setError(e?.message || "No se pudo cargar el cierre del día. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, session.user.id],
  );

  useFocusEffect(useCallback(() => { load(date); }, [load, date]));

  const isToday = date === todayISO();
  const linked = data?.linked !== false;
  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name || "";
  const collectorName = session?.user?.full_name || session?.user?.user_name || "";

  // Se comparte como IMAGEN (la hoja nativa de compartir ofrece WhatsApp,
  // correo, etc.), igual que el estado de cuenta y el comprobante de pago.
  const onShare = async () => {
    try {
      setSharing(true);
      if (!(await Sharing.isAvailableAsync())) {
        setError("Este dispositivo no permite compartir archivos.");
        return;
      }
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Cierre del día" });
    } catch (e) {
      setError(e?.message ?? "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle}>Cierre del día</Text>
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
        <Text style={styles.heroLabel}>Total cobrado</Text>
        <Text variant="headlineMedium" style={styles.heroAmount}>{money(data?.total || 0)}</Text>
        <Text style={styles.heroSub}>
          {data && linked
            ? `${data.payments_count} pagos${pending.count > 0 ? ` · + ${money(pending.amount)} sin enviar` : ""}`
            : " "}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(date, true)} />}
      >
        <OfflineNotice cachedAt={cachedAt} />
        {loading && !data ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} /> : null}
        {!!error && <Text style={[styles.empty, { color: COLORS.danger }]}>{error}</Text>}
        {data && !linked && <Text style={styles.empty}>{data.message}</Text>}

        {(pending.count > 0 || pending.failedCount > 0) && (
          <View style={styles.warn}>
            {pending.count > 0 && (
              <Text style={styles.warnText}>
                Tenés {pending.count} pago{pending.count === 1 ? "" : "s"} sin enviar por {money(pending.amount)}
                {pending.cashAmount > 0 ? ` (${money(pending.cashAmount)} en efectivo)` : ""}. Todavía no están en el
                total de abajo — se suman solos cuando vuelva la señal.
              </Text>
            )}
            {pending.failedCount > 0 && (
              <Text style={[styles.warnText, { color: COLORS.danger }]}>
                {pending.failedCount} pago{pending.failedCount === 1 ? "" : "s"} por {money(pending.failedAmount)} fue
                {pending.failedCount === 1 ? "" : "ron"} rechazado{pending.failedCount === 1 ? "" : "s"} por el servidor y
                no se va a enviar: revisalo en Pendientes de sincronizar.
              </Text>
            )}
          </View>
        )}

        {data && linked && (
          <>
            <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={{ gap: SPACING.md, backgroundColor: COLORS.bg }}>
            <ShareCardHeader
              logoUrl={logoUrl}
              tenantName={tenantName}
              title="Cierre del día"
              lines={[`Fecha: ${data.date}`, collectorName ? `Cobrador: ${collectorName}` : ""]}
            />
            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Cobrado por forma de pago</Text>
              {data.by_method.length === 0 && <Text style={styles.muted}>No hay pagos registrados este día.</Text>}
              {data.by_method.map((m) => (
                <Row key={m.id} label={`${m.name} (${m.count})`} value={money(m.amount)} />
              ))}
              {data.by_method.length > 0 && <Row label="Total" value={money(data.total)} color={COLORS.success} />}
              {data.voided_count > 0 && (
                <Text style={styles.muted}>
                  {data.voided_count} pago{data.voided_count === 1 ? "" : "s"} anulado{data.voided_count === 1 ? "" : "s"}{" "}
                  este día (no se cuentan).
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text variant="titleMedium" style={styles.cardTitle}>Lo que debo entregar</Text>
              <Row label="Efectivo del día" value={money(data.cash_to_deliver)} color={COLORS.success} />
              {pending.cashAmount > 0 && (
                <>
                  <Row label="Efectivo sin enviar (pagos sin señal)" value={money(pending.cashAmount)} color={COLORS.warning} />
                  <Row
                    label="Efectivo total del día"
                    value={money(data.cash_to_deliver + pending.cashAmount)}
                    color={COLORS.success}
                  />
                </>
              )}
              <Row label="Transferencias, cheques y depósitos" value={money(data.non_cash_total)} />
              {data.custody_pending != null && (
                <>
                  <Row label="Efectivo acumulado en mi poder" value={money(data.custody_pending)} color={COLORS.danger} />
                  <Text style={styles.muted}>
                    Es todo el efectivo que has cobrado y que la oficina todavía no te liquida (arqueo o depósito al
                    banco), de este día y de anteriores.
                  </Text>
                </>
              )}
            </View>

            {data.payments.length > 0 && (
              <View style={styles.card}>
                <Text variant="titleMedium" style={styles.cardTitle}>Pagos del día</Text>
                {data.payments.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.payRow}
                    onPress={p.has_photo || p.has_signature ? () => setEvidenceFor(p) : undefined}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payName} numberOfLines={1}>{p.customer_name || `Crédito #${p.credit_code}`}</Text>
                      <Text style={styles.muted}>
                        {`Crédito #${p.credit_code} · ${p.forma_pago_name}${p.time ? ` · ${p.time}` : ""}`}
                      </Text>
                    </View>
                    {p.has_photo && <MaterialCommunityIcons name="camera-outline" size={16} color={COLORS.primary} />}
                    {p.has_signature && <MaterialCommunityIcons name="draw" size={16} color={COLORS.primary} />}
                    <Text style={styles.value}>{money(p.amount)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            </ViewShot>

            <Button
              mode="contained-tonal"
              icon="whatsapp"
              onPress={onShare}
              loading={sharing}
              disabled={sharing}
              style={{ borderRadius: RADIUS.md }}
            >
              Compartir cierre del día (imagen)
            </Button>
          </>
        )}
      </ScrollView>

      <PaymentEvidenceModal
        paymentId={evidenceFor?.id}
        subtitle={evidenceFor ? `${evidenceFor.customer_name || "Cliente"} — Crédito #${evidenceFor.credit_code}` : ""}
        onDismiss={() => setEvidenceFor(null)}
      />
    </SafeAreaView>
  );
}
