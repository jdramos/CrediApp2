import React, { useCallback, useContext, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Button, ActivityIndicator, IconButton, Chip } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getMyPayments } from "../api/collectionsApi";
import PaymentEvidenceModal from "../components/PaymentEvidenceModal";
import PaymentReceiptModal from "../components/PaymentReceiptModal";
import { usePendingPayments } from "../offline/pendingPayments";
import { money } from "../utils/format";
import { todayISO, shiftDay } from "../utils/date";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const PAGE_SIZE = 50;

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
  periods: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs },
  total: { color: COLORS.onGradient, fontWeight: "800", fontSize: 30, marginTop: SPACING.sm },
  totalSub: { color: COLORS.onGradient, opacity: 0.85 },
  methods: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.sm },
  listContent: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.sm },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: SPACING.sm },
  dayHeaderText: { fontWeight: "800", color: COLORS.text },
  dayHeaderTotal: { fontWeight: "700", color: COLORS.muted },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.sm },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  amount: { fontWeight: "800", color: COLORS.success, fontSize: 16 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  chipsRow: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs },
  notice: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  noticeText: { color: COLORS.text, fontSize: 13 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  error: { textAlign: "center", color: COLORS.danger, marginTop: SPACING.lg, paddingHorizontal: SPACING.xl },
});

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Períodos que se pueden elegir. Todos devuelven { from, to } en YYYY-MM-DD,
// calculados con la fecha local del teléfono (igual que el resto de la app).
function periodRange(key) {
  const today = todayISO();
  const [y, m, d] = today.split("-").map(Number);
  switch (key) {
    case "yesterday": {
      const day = shiftDay(today, -1);
      return { from: day, to: day };
    }
    case "week": {
      // Semana de lunes a hoy.
      const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = domingo
      return { from: shiftDay(today, -((dow + 6) % 7)), to: today };
    }
    case "month":
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
    case "prevMonth": {
      const first = new Date(y, m - 2, 1, 12);
      const last = new Date(y, m - 1, 0, 12);
      const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      return { from: iso(first), to: iso(last) };
    }
    default:
      return { from: today, to: today };
  }
}

const PERIODS = [
  ["today", "Hoy"],
  ["yesterday", "Ayer"],
  ["week", "Semana"],
  ["month", "Mes"],
  ["prevMonth", "Mes anterior"],
];

const dayLabel = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = WEEKDAYS[new Date(y, m - 1, d, 12).getDay()];
  const label = `${dow.charAt(0).toUpperCase()}${dow.slice(1)} ${d} de ${MONTHS[m - 1]}`;
  return iso === todayISO() ? `Hoy · ${label}` : label;
};

// "Mis cobros": los pagos que registró el cobrador (el servidor filtra por el
// cobrador vinculado al usuario), con total, capital/interés y forma de pago
// del período elegido. Tocar un cobro abre el estado de cuenta del crédito.
export default function PaymentHistoryScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const pending = usePendingPayments();
  const [period, setPeriod] = useState("today");
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [linked, setLinked] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [evidenceFor, setEvidenceFor] = useState(null);
  const [receiptFor, setReceiptFor] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (nextPage = 1) => {
      const id = ++requestId.current;
      if (nextPage === 1) setLoading(true);
      else setLoadingMore(true);
      setError("");
      try {
        const { from, to } = periodRange(period);
        const res = await getMyPayments(session.token, { from, to, page: nextPage, pageSize: PAGE_SIZE });
        if (id !== requestId.current) return; // llegó una respuesta vieja de otro período
        setLinked(res?.linked !== false);
        setSummary(res?.summary || null);
        setHasMore(!!res?.has_more);
        setPage(nextPage);
        setItems((prev) => (nextPage === 1 ? res?.data || [] : [...prev, ...(res?.data || [])]));
      } catch (e) {
        if (id !== requestId.current) return;
        if (nextPage === 1) {
          setItems([]);
          setSummary(null);
        }
        setError(e?.message || "No se pudo cargar tus cobros. Revisá tu conexión.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [session.token, period],
  );

  useFocusEffect(useCallback(() => { load(1); }, [load]));

  // Lista plana con encabezado por día (cuando el período abarca varios días).
  const multiDay = period !== "today" && period !== "yesterday";
  const rows = [];
  let lastDay = null;
  const dayTotals = {};
  items.forEach((p) => { dayTotals[p.payment_date] = (dayTotals[p.payment_date] || 0) + Number(p.amount || 0); });
  items.forEach((p) => {
    if (multiDay && p.payment_date !== lastDay) {
      rows.push({ key: `day-${p.payment_date}`, type: "day", date: p.payment_date });
      lastDay = p.payment_date;
    }
    rows.push({ key: `pay-${p.id}`, type: "payment", payment: p });
  });

  const count = summary?.payments_count || 0;

  const renderItem = ({ item }) => {
    if (item.type === "day") {
      return (
        <View style={styles.dayHeader}>
          <Text style={styles.dayHeaderText}>{dayLabel(item.date)}</Text>
          <Text style={styles.dayHeaderTotal}>{money(dayTotals[item.date])}</Text>
        </View>
      );
    }
    const p = item.payment;
    const hasEvidence = p.evidence_photo > 0 || p.evidence_signature > 0;
    return (
      <Pressable style={styles.row} onPress={() => navigation.navigate("AccountStatement", { loanId: p.loan_id })}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>{p.customer_name || "Cliente"}</Text>
          <Text style={styles.amount}>{money(p.amount)}</Text>
        </View>
        <Text style={styles.muted}>
          Crédito #{p.credit_code || p.loan_id} · {p.forma_pago_name || "-"}
          {p.time ? ` · ${p.time}` : ""}
        </Text>
        <Text style={styles.muted}>
          Capital {money(p.principal_payment)} · Interés {money(p.interest_payment)}
        </Text>
        <View style={styles.chipsRow}>
          <Chip compact icon="receipt-text-outline" style={{ backgroundColor: COLORS.primarySoft }} onPress={() => setReceiptFor(p)}>
            Comprobante
          </Chip>
          {hasEvidence && (
            <>
            {p.evidence_photo > 0 && (
              <Chip compact icon="camera-outline" style={{ backgroundColor: COLORS.primarySoft }} onPress={() => setEvidenceFor(p)}>
                Foto
              </Chip>
            )}
            {p.evidence_signature > 0 && (
              <Chip compact icon="draw" style={{ backgroundColor: COLORS.primarySoft }} onPress={() => setEvidenceFor(p)}>
                Firma
              </Chip>
            )}
            </>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle}>Mis cobros</Text>
        </View>

        <View style={styles.periods}>
          {PERIODS.map(([key, label]) => (
            <Chip key={key} compact selected={period === key} showSelectedCheck={false} onPress={() => setPeriod(key)}>
              {label}
            </Chip>
          ))}
        </View>

        {summary && linked && (
          <>
            <Text style={styles.total}>{money(summary.total)}</Text>
            <Text style={styles.totalSub}>
              {count} cobro{count === 1 ? "" : "s"} · Capital {money(summary.principal)} · Interés {money(summary.interest)}
              {summary.other > 0 ? ` · Otros ${money(summary.other)}` : ""}
            </Text>
            {summary.by_method?.length > 0 && (
              <View style={styles.methods}>
                {summary.by_method.map((m) => (
                  <Chip key={String(m.id)} compact>{`${m.name}: ${money(m.amount)} (${m.count})`}</Chip>
                ))}
              </View>
            )}
          </>
        )}
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {!!error && <Text style={styles.error}>{error}</Text>}
              {(pending.count > 0 || pending.failedCount > 0) && (
                <View style={styles.notice}>
                  {pending.count > 0 && (
                    <Text style={styles.noticeText}>
                      Tenés {pending.count} pago{pending.count === 1 ? "" : "s"} sin enviar por {money(pending.amount)}. Aparecerán
                      aquí cuando se envíen al servidor.
                    </Text>
                  )}
                  {pending.failedCount > 0 && (
                    <Text style={[styles.noticeText, { color: COLORS.danger }]}>
                      {pending.failedCount} pago{pending.failedCount === 1 ? "" : "s"} fue{pending.failedCount === 1 ? "" : "ron"} rechazado
                      {pending.failedCount === 1 ? "" : "s"} por el servidor: revisalos en pendientes de envío.
                    </Text>
                  )}
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            !error ? (
              <Text style={styles.empty}>
                {linked ? "No tenés cobros registrados en este período." : "Tu usuario todavía no está vinculado a ningún cobrador."}
              </Text>
            ) : null
          }
          ListFooterComponent={
            hasMore ? (
              <Button mode="outlined" loading={loadingMore} disabled={loadingMore} onPress={() => load(page + 1)} style={{ borderRadius: RADIUS.md }}>
                Ver más cobros
              </Button>
            ) : null
          }
        />
      )}

      <PaymentReceiptModal payment={receiptFor} onDismiss={() => setReceiptFor(null)} />
      <PaymentEvidenceModal
        paymentId={evidenceFor?.id}
        subtitle={evidenceFor ? `${evidenceFor.customer_name || "Cliente"} — Crédito #${evidenceFor.credit_code || evidenceFor.loan_id}` : ""}
        onDismiss={() => setEvidenceFor(null)}
      />
    </SafeAreaView>
  );
}
