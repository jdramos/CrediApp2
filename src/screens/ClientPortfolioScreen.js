import React, { useCallback, useContext, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Text,
  TextInput,
  Card,
  Chip,
  Button,
  ActivityIndicator,
  HelperText,
  IconButton,
  Portal,
  Modal,
  Divider,
} from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import { SessionContext } from "../auth/SessionContext";
import { getAssignedLoans, logVisit } from "../api/collectionsApi";
import { isNetworkError } from "../api/credimasterClient";
import { getCustomer, saveCustomerLocation } from "../api/customerApi";
import { confirmAction } from "../utils/confirm";
import { enqueue } from "../offline/queue";
import { useSync } from "../offline/SyncProvider";
import { money, toNumber } from "../utils/format";
import { todayISO, shiftDay } from "../utils/date";
import { ACTION_TYPES, RESULTS, STAGES } from "../utils/collectionsCatalog";
import {
  openDirections,
  customerDestination,
  distanceMeters,
  formatDistance,
  planRoute,
  routeLength,
  openRouteInMaps,
  MAPS_MAX_STOPS,
} from "../utils/maps";
import { buildReminderMessage, callPhone, openSms, openWhatsApp, phoneOf } from "../utils/contact";
import AddressLines from "../components/AddressLines";
import { ensureWorkday } from "../tracking/workday";
import OfflineNotice from "../components/OfflineNotice";
import { cachedFetch, readCache } from "../offline/cache";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const emptyGestionForm = {
  action_type: "VISIT",
  action_date: todayISO(),
  result: "CONTACTED",
  stage: "PREVENTIVE",
  notes: "",
  promised_amount: "",
  promised_date: "",
  next_action_date: "", // "volver a visitar": avisa ese día y entra a "Por visitar hoy"
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2, paddingHorizontal: SPACING.lg },
  searchWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 110, gap: SPACING.sm },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.xs },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  overdueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    marginTop: SPACING.xs,
  },
  overdueText: { color: COLORS.danger, fontWeight: "700", fontSize: 13 },
  overdueAmount: { color: COLORS.danger, fontWeight: "800", fontSize: 15 },
  balancesRow: { flexDirection: "row", gap: SPACING.lg, marginTop: SPACING.sm },
  balanceLabel: { color: COLORS.muted, fontSize: 11 },
  balanceValue: { color: COLORS.text, fontWeight: "700" },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  actionsRow: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.md },
  actionBtn: { flex: 1, borderRadius: RADIUS.md },
  actionBtnLabel: { fontSize: 11, marginVertical: 6 },
});

export default function ClientPortfolioScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const { refreshPendingCount } = useSync();

  const [search, setSearch] = useState("");
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [managedIds, setManagedIds] = useState(new Set());

  // Orden de la lista: "mora" (como lo manda el servidor: más atrasados primero)
  // o "near" (más cerca de la ubicación actual del cobrador, en línea recta,
  // usando la casa o el negocio guardados del cliente).
  const [sortMode, setSortMode] = useState("mora");
  const [myPos, setMyPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  // Filtro rápido de la cartera (ver FILTERS).
  const [filter, setFilter] = useState("all");

  // Guardar la ubicación (casa o negocio) de un cliente que aún no la tiene.
  const [placeItem, setPlaceItem] = useState(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const canEditCustomer = session?.permissions?.includes("clientes.editar");

  const [gestionItem, setGestionItem] = useState(null);
  const [gestionForm, setGestionForm] = useState(emptyGestionForm);
  const [gestionError, setGestionError] = useState("");
  const [savingGestion, setSavingGestion] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPromiseDatePicker, setShowPromiseDatePicker] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);

  const canLogVisit = session?.permissions?.includes("cobranza.gestionar");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const q = search.trim();
      const cacheKey = `${session.user.id}:portfolio`;
      let res;
      let stamp = null;
      if (!q) {
        // Cartera completa: se guarda para poder verla sin señal.
        const r = await cachedFetch(cacheKey, () => getAssignedLoans(session.token));
        res = r.data;
        stamp = r.cachedAt;
      } else {
        try {
          res = await getAssignedLoans(session.token, { search: q });
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          // Sin señal: se busca dentro de la última cartera guardada.
          const cached = await readCache(cacheKey);
          if (!cached) throw e;
          const ql = q.toLowerCase();
          res = {
            ...cached.data,
            data: (cached.data?.data || []).filter((l) =>
              [l.customer_name, l.credit_code, l.customer_identification].some((v) =>
                String(v || "").toLowerCase().includes(ql),
              ),
            ),
          };
          stamp = cached.cachedAt;
        }
      }
      setLoans(res?.data || []);
      setMessage(res?.message || "");
      setCachedAt(stamp);
    } catch (e) {
      setError(e?.message ?? "Error cargando tu cartera");
    } finally {
      setLoading(false);
    }
  }, [session.token, session.user.id, search]);

  useFocusEffect(useCallback(() => { setManagedIds(new Set()); load(); }, [load]));

  // Toma la ubicación actual (con respaldo a la última conocida). Si no hay
  // permiso o GPS, vuelve al orden por mora y avisa.
  const locate = async () => {
    setLocating(true);
    setLocError("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Permití el acceso a la ubicación para ordenar por cercanía.");
      let pos = null;
      try {
        pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 12000)),
        ]);
      } catch {
        pos = await Location.getLastKnownPositionAsync().catch(() => null);
      }
      if (!pos) throw new Error("No se pudo obtener tu ubicación. Revisá que el GPS esté encendido.");
      setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e) {
      setLocError(e?.message || "No se pudo obtener tu ubicación.");
      setSortMode("mora");
    } finally {
      setLocating(false);
    }
  };

  // Guarda la ubicación ACTUAL del cobrador como la casa o el negocio del cliente.
  // El backend pide el registro completo del cliente en cada PUT, así que se
  // trae primero y solo cambian las coordenadas del lugar elegido.
  const savePlace = async (item, target) => {
    setPlaceBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") throw new Error("Permití el acceso a la ubicación para guardarla.");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const res = await getCustomer(session.token, item.customer_id);
      const customer = res?.data?.customer;
      if (!customer) throw new Error("No se pudo cargar la ficha del cliente.");
      const location = {
        home_lat: customer.home_lat ?? null,
        home_lng: customer.home_lng ?? null,
        business_lat: customer.business_lat ?? null,
        business_lng: customer.business_lng ?? null,
        [`${target}_lat`]: pos.coords.latitude,
        [`${target}_lng`]: pos.coords.longitude,
      };
      await saveCustomerLocation(session.token, item.customer_id, customer, location);
      // Se refleja en la lista al instante (todos los créditos de ese cliente).
      setLoans((prev) =>
        prev.map((l) =>
          l.customer_id === item.customer_id
            ? { ...l, [`${target}_lat`]: String(pos.coords.latitude), [`${target}_lng`]: String(pos.coords.longitude) }
            : l,
        ),
      );
      setPlaceItem(null);
      Alert.alert("Ubicación guardada", `Quedó guardada la ${target === "home" ? "casa" : "negocio"} de ${item.customer_name || "el cliente"}.`);
    } catch (e) {
      Alert.alert(
        "No se pudo guardar",
        isNetworkError(e) ? "Se necesita conexión para guardar la ubicación de un cliente. Intentá de nuevo cuando tengas señal." : e?.message || "Error al guardar la ubicación",
      );
    } finally {
      setPlaceBusy(false);
    }
  };

  const askSavePlace = (item, target) =>
    confirmAction(
      "Guardar ubicación",
      `¿Guardar tu ubicación actual como la ${target === "home" ? "casa" : "negocio"} de ${item.customer_name || "este cliente"}? Tenés que estar en ese lugar.`,
      () => savePlace(item, target),
    );

  const chooseSort = (mode) => {
    setSortMode(mode);
    if (mode === "near" || mode === "route") locate();
  };

  // Filtros rápidos. "Por visitar hoy" = lo que hoy pide una visita (en mora,
  // cuota que vence hoy, promesa de pago ya cumplida en fecha o seguimiento
  // agendado para hoy o antes) y todavía no se
  // gestionó hoy (ni en el servidor ni en la cola sin conexión).
  const today = todayISO();
  const isManaged = (l) => Number(l.managed_today) === 1 || managedIds.has(l.loan_id);
  const FILTERS = [
    ["all", "Todos", () => true],
    ["mora", "En mora", (l) => Number(l.days_overdue) > 0],
    ["today", "Vencen hoy", (l) => Number(l.due_today) === 1],
    ["promise", "Con promesa", (l) => !!l.promised_date],
    ["follow", "Seguimiento", (l) => !!l.followup_date && l.followup_date <= today && !isManaged(l)],
    [
      "visit",
      "Por visitar hoy",
      (l) =>
        !isManaged(l) &&
        (Number(l.days_overdue) > 0 ||
          Number(l.due_today) === 1 ||
          (!!l.promised_date && String(l.promised_date).slice(0, 10) <= today) ||
          (!!l.followup_date && l.followup_date <= today)),
    ],
  ];
  const filterFn = FILTERS.find(([k]) => k === filter)?.[2] || (() => true);
  const filteredLoans = loans.filter(filterFn);

  // Lista a mostrar. "near": por distancia a tu ubicación. "route": en el orden de
  // un recorrido sugerido (vecino más cercano afinado con 2-opt) con el tramo de
  // cada parada. Los clientes sin ubicación guardada van al final.
  const shown = useMemo(() => {
    if ((sortMode !== "near" && sortMode !== "route") || !myPos) return { list: filteredLoans, stats: null };
    const withDest = filteredLoans.map((l) => ({ l, dest: customerDestination(l) }));
    const located = withDest.filter((x) => x.dest);
    const missing = withDest.filter((x) => !x.dest).map((x) => x.l);

    if (sortMode === "near") {
      const list = located
        .map(({ l, dest }) => ({ ...l, _dist: distanceMeters(myPos, dest), _distLabel: dest.label }))
        .sort((a, b) => a._dist - b._dist);
      return { list: [...list, ...missing], stats: null };
    }

    const points = located.map((x) => x.dest);
    const order = planRoute(myPos, points);
    let prev = myPos;
    const list = order.map((idx, k) => {
      const { l, dest } = located[idx];
      const leg = distanceMeters(prev, dest);
      prev = dest;
      return { ...l, _stop: k + 1, _leg: leg, _distLabel: dest.label, _lat: dest.lat, _lng: dest.lng };
    });
    return {
      list: [...list, ...missing],
      stats: { stops: list.length, meters: routeLength(myPos, points, order), missing: missing.length },
    };
  }, [loans, filter, managedIds, sortMode, myPos]);
  const shownLoans = shown.list;

  const openRoute = async () => {
    const stops = shownLoans.filter((l) => l._stop).map((l) => ({ lat: l._lat, lng: l._lng }));
    await openRouteInMaps(myPos, stops);
  };

  const overdueSummary = useMemo(() => {
    const overdue = loans.filter((l) => Number(l.days_overdue) > 0);
    const amount = overdue.reduce(
      (sum, l) => sum + Number(l.overdue_amount || 0),
      0,
    );
    return { count: overdue.length, amount };
  }, [loans]);

  const goToPay = (item) => {
    navigation.navigate("PaymentsHome", {
      prefill: {
        customerId: item.customer_id,
        customerName: item.customer_name,
        customerIdentification: item.customer_identification,
        homeAddress: item.home_address,
        businessAddress: item.business_address,
        cellphone: item.cellphone,
        telephone: item.telephone,
        loanId: item.loan_id,
      },
    });
  };

  // "Contactar": llamar, o mandar un recordatorio de cobro por WhatsApp / SMS
  // con el texto ya escrito (cuotas vencidas y su valor, o la próxima cuota).
  const [contactItem, setContactItem] = useState(null);
  const reminderText = (item) =>
    buildReminderMessage({
      tenantName: session?.tenant?.commercial_name || session?.tenant?.legal_name,
      customerName: item.customer_name,
      loanLabel: item.credit_code || item.loan_id,
      overdueInstallments: item.overdue_installments,
      overdueAmount: item.overdue_amount,
      daysOverdue: item.days_overdue,
      nextAmount: item.installment_amount,
      nextDate: item.next_payment_date,
    });
  const contactAction = (fn) => {
    const item = contactItem;
    setContactItem(null);
    if (item) fn(item);
  };

  const openGestion = async (item) => {
    // Jornada obligatoria (ver tracking/workday.js).
    if (!(await ensureWorkday(session, "gestiones y visitas"))) return;
    setGestionItem(item);
    setGestionForm(emptyGestionForm);
    setGestionError("");
  };

  const closeGestion = () => {
    if (savingGestion) return;
    setGestionItem(null);
  };

  const setFollowup = (loanId, date) =>
    setLoans((prev) => prev.map((l) => (l.loan_id === loanId ? { ...l, followup_date: date || null } : l)));

  const setG = (field, value) => setGestionForm((prev) => ({ ...prev, [field]: value }));

  const saveGestion = async () => {
    if (!gestionItem) return;
    setGestionError("");

    // La ubicación es best-effort: si el cobrador niega el permiso, el GPS
    // está apagado, o tarda demasiado, la gestión se registra igual sin
    // coordenadas -- el backend las compara contra la casa/negocio
    // guardados del cliente para verificar que realmente estuvo ahí, pero
    // esa verificación no puede bloquear el registro en sí.
    let visitLat = null;
    let visitLng = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        visitLat = position.coords.latitude;
        visitLng = position.coords.longitude;
      }
    } catch {
      // sin ubicación, se sigue igual
    }

    const payload = {
      loan_id: gestionItem.loan_id,
      action_type: gestionForm.action_type,
      action_date: gestionForm.action_date,
      result: gestionForm.result,
      stage: gestionForm.stage,
      notes: gestionForm.notes || undefined,
      promised_amount: gestionForm.promised_amount ? toNumber(gestionForm.promised_amount) : undefined,
      promised_date: gestionForm.promised_date || undefined,
      next_action_date: gestionForm.next_action_date || undefined,
      visit_lat: visitLat,
      visit_lng: visitLng,
    };

    try {
      setSavingGestion(true);
      await logVisit(session.token, payload);
      setFollowup(gestionItem.loan_id, payload.next_action_date);
      setManagedIds((prev) => new Set(prev).add(gestionItem.loan_id));
      setGestionItem(null);
    } catch (e) {
      if (isNetworkError(e)) {
        try {
          await enqueue({
            type: "VISIT",
            label: `${ACTION_TYPES.find(([k]) => k === payload.action_type)?.[1] || "Gestión"} — ${gestionItem.customer_name || "cliente"}`,
            payload,
          });
          refreshPendingCount();
          setFollowup(gestionItem.loan_id, payload.next_action_date);
          setManagedIds((prev) => new Set(prev).add(gestionItem.loan_id));
          setGestionItem(null);
          Alert.alert("Sin conexión", "La gestión se guardó en el equipo y se registrará sola cuando vuelva la señal.");
        } catch (queueErr) {
          setGestionError(queueErr?.message ?? "No se pudo guardar la gestión para registrarla después");
        }
        return;
      }
      setGestionError(e?.message ?? "No se pudo registrar la gestión");
    } finally {
      setSavingGestion(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Mi cartera</Text>
      </View>
      <Text style={styles.sub}>
        {loans.length} cliente{loans.length === 1 ? "" : "s"} asignado{loans.length === 1 ? "" : "s"}
        {overdueSummary.count > 0 ? ` · ${overdueSummary.count} en mora (${money(overdueSummary.amount)})` : ""}
      </Text>

      <View style={styles.searchWrap}>
        <TextInput
          mode="outlined"
          placeholder="Buscar por nombre, cédula o # de crédito"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          autoCapitalize="none"
          style={{ backgroundColor: COLORS.card }}
          outlineStyle={{ borderRadius: RADIUS.md }}
          left={<TextInput.Icon icon="magnify" />}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.sm }}>
          <Chip
            icon="alert-circle-outline"
            selected={sortMode === "mora"}
            showSelectedCheck={false}
            onPress={() => chooseSort("mora")}
            style={{ backgroundColor: sortMode === "mora" ? COLORS.primarySoft : COLORS.card }}
          >
            Por mora
          </Chip>
          <Chip
            icon={locating ? "crosshairs-gps" : "map-marker-radius-outline"}
            selected={sortMode === "near"}
            showSelectedCheck={false}
            onPress={() => chooseSort("near")}
            style={{ backgroundColor: sortMode === "near" ? COLORS.primarySoft : COLORS.card }}
          >
            {locating && sortMode === "near" ? "Ubicándote…" : "Más cerca de mí"}
          </Chip>
          <Chip
            icon="map-marker-path"
            selected={sortMode === "route"}
            showSelectedCheck={false}
            onPress={() => chooseSort("route")}
            style={{ backgroundColor: sortMode === "route" ? COLORS.primarySoft : COLORS.card }}
          >
            {locating && sortMode === "route" ? "Ubicándote…" : "Ruta sugerida"}
          </Chip>
        </View>
        {sortMode === "route" && myPos && !locating && shown.stats && (
          <View style={{ marginTop: SPACING.xs, gap: SPACING.xs }}>
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>
              {shown.stats.stops === 0
                ? "Ningún cliente de este filtro tiene ubicación guardada."
                : `${shown.stats.stops} parada${shown.stats.stops === 1 ? "" : "s"} · ≈ ${formatDistance(shown.stats.meters)} en línea recta${
                    shown.stats.missing > 0 ? ` · ${shown.stats.missing} sin ubicación al final` : ""
                  }`}
            </Text>
            {shown.stats.stops > 0 && (
              <Button mode="contained" icon="google-maps" onPress={openRoute} style={{ borderRadius: RADIUS.md }}>
                {shown.stats.stops > MAPS_MAX_STOPS ? `Abrir las primeras ${MAPS_MAX_STOPS} paradas en Maps` : "Abrir ruta en Google Maps"}
              </Button>
            )}
          </View>
        )}
        {sortMode === "near" && myPos && !locating && (
          <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: SPACING.xs }}>
            Distancia en línea recta desde tu ubicación. Tocá «Más cerca de mí» para actualizarla.
          </Text>
        )}
        {!!locError && <Text style={{ color: COLORS.danger, fontSize: 12, marginTop: SPACING.xs }}>{locError}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.sm }}>
          {FILTERS.map(([key, label, fn]) => (
            <Chip
              key={key}
              compact
              selected={filter === key}
              showSelectedCheck={false}
              onPress={() => setFilter(key)}
              style={{ backgroundColor: filter === key ? COLORS.primarySoft : COLORS.card }}
            >
              {`${label} (${loans.filter(fn).length})`}
            </Chip>
          ))}
        </View>
      </View>

      <View style={{ marginHorizontal: SPACING.lg }}>
        <OfflineNotice cachedAt={cachedAt} />
      </View>
      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>
      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {!loading && !!message && loans.length === 0 && (
        <Text style={styles.empty}>{message}</Text>
      )}

      {!loading && (
        <FlatList
          data={shownLoans}
          keyExtractor={(item) => String(item.loan_id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={!message ? <Text style={styles.empty}>No tenés clientes asignados con estos filtros.</Text> : null}
          renderItem={({ item }) => {
            const inArrears = item.days_overdue != null && Number(item.days_overdue) > 0;
            const phone = item.cellphone || item.telephone;
            const managed = managedIds.has(item.loan_id);
            return (
              <Card style={styles.row} onPress={() => navigation.navigate("AccountStatement", { loanId: item.loan_id })}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.customer_name || "Cliente"}</Text>
                  {Number(item.due_today) === 1 && (
                    <Chip compact style={{ backgroundColor: COLORS.warningSoft }} textStyle={{ color: COLORS.warning, fontWeight: "700" }}>
                      Vence hoy
                    </Chip>
                  )}
                  {inArrears ? (
                    <Chip compact style={{ backgroundColor: COLORS.dangerSoft }} textStyle={{ color: COLORS.danger, fontWeight: "700" }}>
                      Mora {item.days_overdue}d
                    </Chip>
                  ) : (
                    <Chip compact style={{ backgroundColor: COLORS.successSoft }} textStyle={{ color: COLORS.success, fontWeight: "700" }}>
                      Al día
                    </Chip>
                  )}
                </View>
                <Text style={styles.muted}>Código: {item.customer_identification} · Crédito #{item.credit_code || item.loan_id}</Text>
                <AddressLines customer={item} />
                {(sortMode === "near" || sortMode === "route") && myPos && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <MaterialCommunityIcons
                      name={item._stop && item._stop <= 9 ? `numeric-${item._stop}-circle-outline` : "map-marker-distance"}
                      size={14}
                      color={item._dist != null || item._stop ? COLORS.primary : COLORS.muted}
                    />
                    <Text style={{ color: item._dist != null || item._stop ? COLORS.primary : COLORS.muted, fontSize: 12, fontWeight: "700" }}>
                      {item._stop
                        ? `Parada ${item._stop} · a ${formatDistance(item._leg)} ${item._stop === 1 ? "de tu ubicación" : "de la parada anterior"} (${item._distLabel})`
                        : item._dist != null
                          ? `a ${formatDistance(item._dist)} (${item._distLabel})`
                          : "Sin ubicación guardada"}
                    </Text>
                  </View>
                )}
                {!!item.promised_date && (
                  <Text style={{ color: String(item.promised_date).slice(0, 10) < today ? COLORS.danger : COLORS.primary, fontSize: 12, fontWeight: "700", marginTop: 2 }}>
                    Promesa: {item.promised_amount != null ? `${money(item.promised_amount)} ` : ""}para el {String(item.promised_date).slice(0, 10)}
                    {String(item.promised_date).slice(0, 10) < today ? " (vencida)" : String(item.promised_date).slice(0, 10) === today ? " (hoy)" : ""}
                  </Text>
                )}
                {!!item.followup_date && (
                  <Text style={{ color: item.followup_date < today ? COLORS.danger : COLORS.primary, fontSize: 12, fontWeight: "700", marginTop: 2 }}>
                    Volver a visitar: {item.followup_date}
                    {item.followup_date < today ? " (vencida)" : item.followup_date === today ? " (hoy)" : ""}
                  </Text>
                )}
                {canEditCustomer && !customerDestination(item) && (
                  <Button
                    compact
                    mode="text"
                    icon="map-marker-plus-outline"
                    onPress={() => setPlaceItem(item)}
                    style={{ alignSelf: "flex-start", marginLeft: -SPACING.sm }}
                    labelStyle={{ fontSize: 12 }}
                  >
                    Guardar ubicación
                  </Button>
                )}
                <View style={styles.balancesRow}>
                  <View>
                    <Text style={styles.balanceLabel}>Próxima cuota</Text>
                    <Text style={styles.balanceValue}>
                      {item.installment_amount != null ? money(item.installment_amount) : "—"}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.balanceLabel}>Saldo capital</Text>
                    <Text style={styles.balanceValue}>{money(item.principal_balance)}</Text>
                  </View>
                  <View>
                    <Text style={styles.balanceLabel}>Saldo interés</Text>
                    <Text style={styles.balanceValue}>{money(item.interest_balance)}</Text>
                  </View>
                </View>
                {inArrears && Number(item.overdue_installments) > 0 && (
                  <View style={styles.overdueRow}>
                    <Text style={styles.overdueText}>
                      {item.overdue_installments} cuota{Number(item.overdue_installments) === 1 ? "" : "s"} en mora
                    </Text>
                    <Text style={styles.overdueAmount}>{money(item.overdue_amount)}</Text>
                  </View>
                )}
                <View style={styles.actionsRow}>
                  <Button compact mode="outlined" icon="cash-fast" onPress={() => goToPay(item)} style={styles.actionBtn} labelStyle={styles.actionBtnLabel}>
                    Pagar
                  </Button>
                  <Button
                    compact
                    mode="outlined"
                    icon="phone-outline"
                    onPress={() => setContactItem(item)}
                    disabled={!phone}
                    style={styles.actionBtn}
                    labelStyle={styles.actionBtnLabel}
                  >
                    Contactar
                  </Button>
                  <Button
                    compact
                    mode="outlined"
                    icon="map-marker-path"
                    onPress={() => openDirections(item)}
                    style={styles.actionBtn}
                    labelStyle={styles.actionBtnLabel}
                  >
                    Ir
                  </Button>
                  {canLogVisit && (
                    <Button
                      compact
                      mode={managed ? "contained" : "outlined"}
                      icon={managed ? "check-circle" : "clipboard-text-outline"}
                      onPress={() => openGestion(item)}
                      style={styles.actionBtn}
                      labelStyle={styles.actionBtnLabel}
                    >
                      {managed ? "Gestionado" : "Gestión"}
                    </Button>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}

      <Portal>
        <Modal
          visible={!!placeItem}
          onDismiss={() => !placeBusy && setPlaceItem(null)}
          contentContainerStyle={{
            backgroundColor: COLORS.card,
            margin: SPACING.lg,
            borderRadius: RADIUS.lg,
            padding: SPACING.lg,
            gap: SPACING.sm,
          }}
        >
          {placeItem && (
            <>
              <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text }}>{placeItem.customer_name}</Text>
              <Text style={{ color: COLORS.muted }}>
                Pará en la puerta del lugar y elegí qué es. Se guarda tu ubicación actual para poder llegar y ordenar la ruta por cercanía.
              </Text>
              <Button mode="contained" icon="home-map-marker" loading={placeBusy} disabled={placeBusy} onPress={() => askSavePlace(placeItem, "home")} style={{ borderRadius: RADIUS.md }}>
                Es su casa
              </Button>
              <Button mode="outlined" icon="store-marker" loading={placeBusy} disabled={placeBusy} onPress={() => askSavePlace(placeItem, "business")} style={{ borderRadius: RADIUS.md }}>
                Es su negocio
              </Button>
              <Button disabled={placeBusy} onPress={() => setPlaceItem(null)}>Cancelar</Button>
            </>
          )}
        </Modal>
        <Modal
          visible={!!contactItem}
          onDismiss={() => setContactItem(null)}
          contentContainerStyle={{
            backgroundColor: COLORS.card,
            margin: SPACING.lg,
            borderRadius: RADIUS.lg,
            padding: SPACING.lg,
            gap: SPACING.sm,
          }}
        >
          {contactItem && (
            <>
              <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text }}>{contactItem.customer_name}</Text>
              <Text style={{ color: COLORS.muted }}>{phoneOf(contactItem)}</Text>
              <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: SPACING.xs }}>{reminderText(contactItem)}</Text>
              <Button mode="contained" icon="phone" onPress={() => contactAction((i) => callPhone(phoneOf(i)))} style={{ borderRadius: RADIUS.md }}>
                Llamar
              </Button>
              <Button mode="outlined" icon="whatsapp" onPress={() => contactAction((i) => openWhatsApp(phoneOf(i), reminderText(i)))} style={{ borderRadius: RADIUS.md }}>
                Recordatorio por WhatsApp
              </Button>
              <Button mode="outlined" icon="message-text-outline" onPress={() => contactAction((i) => openSms(phoneOf(i), reminderText(i)))} style={{ borderRadius: RADIUS.md }}>
                Recordatorio por SMS
              </Button>
              <Button onPress={() => setContactItem(null)}>Cancelar</Button>
            </>
          )}
        </Modal>
        <Modal
          visible={!!gestionItem}
          onDismiss={closeGestion}
          contentContainerStyle={{
            backgroundColor: COLORS.card,
            margin: SPACING.lg,
            borderRadius: RADIUS.lg,
            padding: SPACING.md,
            maxHeight: "85%",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text }}>
              Gestión de cobro
            </Text>
            <Text style={{ color: COLORS.muted, marginBottom: SPACING.md }}>
              {gestionItem?.customer_name || "Cliente"} — Crédito #{gestionItem?.credit_code || gestionItem?.loan_id}
            </Text>

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>Tipo</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.md }}>
              {ACTION_TYPES.map(([k, label]) => (
                <Chip
                  key={k}
                  selected={gestionForm.action_type === k}
                  onPress={() => setG("action_type", k)}
                  style={{ backgroundColor: gestionForm.action_type === k ? COLORS.primarySoft : COLORS.bg }}
                >
                  {label}
                </Chip>
              ))}
            </View>

            <Button
              mode="outlined"
              onPress={() => setShowDatePicker(true)}
              icon="calendar"
              style={{ marginBottom: SPACING.md, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              {gestionForm.action_date}
            </Button>
            {showDatePicker && (
              <DateTimePicker
                value={new Date(gestionForm.action_date)}
                mode="date"
                display="default"
                onChange={(_, selected) => {
                  setShowDatePicker(false);
                  if (selected) setG("action_date", selected.toISOString().slice(0, 10));
                }}
              />
            )}

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>Resultado</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.md }}>
              {RESULTS.map(([k, label]) => (
                <Chip
                  key={k}
                  selected={gestionForm.result === k}
                  onPress={() => setG("result", k)}
                  style={{ backgroundColor: gestionForm.result === k ? COLORS.primarySoft : COLORS.bg }}
                >
                  {label}
                </Chip>
              ))}
            </View>

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>Etapa</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.md }}>
              {STAGES.map(([k, label]) => (
                <Chip
                  key={k}
                  selected={gestionForm.stage === k}
                  onPress={() => setG("stage", k)}
                  style={{ backgroundColor: gestionForm.stage === k ? COLORS.primarySoft : COLORS.bg }}
                >
                  {label}
                </Chip>
              ))}
            </View>

            <TextInput
              mode="outlined"
              label="Notas"
              value={gestionForm.notes}
              onChangeText={(t) => setG("notes", t)}
              multiline
              numberOfLines={3}
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.md }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />

            <Divider style={{ marginBottom: SPACING.md }} />

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>
              Promesa de pago (opcional)
            </Text>
            <TextInput
              mode="outlined"
              label="Monto prometido"
              value={gestionForm.promised_amount}
              onChangeText={(t) => setG("promised_amount", t)}
              keyboardType="decimal-pad"
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
              left={<TextInput.Icon icon="cash" />}
            />
            <Button
              mode="outlined"
              onPress={() => setShowPromiseDatePicker(true)}
              icon="calendar"
              style={{ marginBottom: SPACING.md, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              {gestionForm.promised_date || "Fecha de promesa"}
            </Button>
            {showPromiseDatePicker && (
              <DateTimePicker
                value={gestionForm.promised_date ? new Date(gestionForm.promised_date) : new Date()}
                mode="date"
                display="default"
                onChange={(_, selected) => {
                  setShowPromiseDatePicker(false);
                  if (selected) setG("promised_date", selected.toISOString().slice(0, 10));
                }}
              />
            )}

            <Text style={{ fontWeight: "700", color: COLORS.text, marginBottom: SPACING.xs }}>Volver a visitar</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginBottom: SPACING.xs }}>
              {[["Mañana", 1], ["En 3 días", 3], ["En 1 semana", 7], ["En 2 semanas", 14]].map(([label, days]) => {
                const date = shiftDay(todayISO(), days);
                return (
                  <Chip
                    key={label}
                    selected={gestionForm.next_action_date === date}
                    showSelectedCheck={false}
                    onPress={() => setG("next_action_date", gestionForm.next_action_date === date ? "" : date)}
                    style={{ backgroundColor: gestionForm.next_action_date === date ? COLORS.primarySoft : COLORS.bg }}
                  >
                    {label}
                  </Chip>
                );
              })}
            </View>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginBottom: SPACING.md }}>
              {gestionForm.next_action_date
                ? `Te avisaremos el ${gestionForm.next_action_date}. Tocá la opción otra vez para quitarla.`
                : "Opcional: la app te lo recuerda ese día y lo pone en «Por visitar hoy»."}
            </Text>

            <HelperText type="error" visible={!!gestionError}>{gestionError}</HelperText>

            <Button
              mode="contained"
              onPress={saveGestion}
              loading={savingGestion}
              disabled={savingGestion}
              style={{ borderRadius: RADIUS.md }}
              contentStyle={{ height: 46 }}
              labelStyle={{ fontWeight: "700" }}
            >
              Registrar gestión
            </Button>
          </ScrollView>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}
