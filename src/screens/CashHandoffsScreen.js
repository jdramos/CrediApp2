import React, { useCallback, useContext, useRef, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, IconButton, Portal, Modal, TextInput, Chip, SegmentedButtons } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import {
  getMyCashHandoffs, getRequestableCollectors, requestCashHandoff, sendCashHandoff, declineCashHandoff,
  cancelCashHandoff, confirmCashHandoff, notReceivedCashHandoff,
} from "../api/cashHandoffApi";
import { confirmAction } from "../utils/confirm";
import { money, formatAmountInput, toNumber } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import KeyboardAwareScroll from "../components/KeyboardAwareScroll";
import useKeyboardModalStyle from "../components/useKeyboardModalStyle";

// Traspaso de efectivo de un cobrador a un desembolsador: el desembolsador
// solicita, el cobrador transfiere y el desembolsador confirma que lo recibió.
const STATUS_COLOR = {
  SOLICITADO: COLORS.warning, ENVIADO: COLORS.primary, CONFIRMADO: COLORS.success,
  RECHAZADO: COLORS.danger, CANCELADO: COLORS.muted, ANULADO: COLORS.muted,
};

// "YYYY-MM-DD HH:mm:ss" (hora de Nicaragua) → "dd/mm/aaaa hh:mm".
const when = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "";
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl, gap: SPACING.sm },
  row: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, ...SHADOW.card },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  amount: { fontWeight: "800", color: COLORS.primary, fontSize: 16 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: SPACING.sm, marginTop: SPACING.sm, flexWrap: "wrap" },
});

export default function CashHandoffsScreen() {
  const modalStyle = useKeyboardModalStyle(styles.modal);
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);

  const [data, setData] = useState(null);
  const [tab, setTab] = useState(null); // "pedidos" (mis solicitudes) | "recibidos" (me piden)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  // Modal: "request" (nueva solicitud), "send" (transferir), "decline", "notReceived".
  const [modal, setModal] = useState(null);
  const [active, setActive] = useState(null);
  const [collectors, setCollectors] = useState([]);
  const [collectorId, setCollectorId] = useState(null);
  const [amountText, setAmountText] = useState("");
  const [notes, setNotes] = useState("");
  const [modalError, setModalError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getMyCashHandoffs(session.token);
      const d = res?.data || null;
      setData(d);
      // Primera vez: arranca en lo que le toca hacer.
      setTab((cur) => cur || (d?.collector_id && !d?.can_request ? "recibidos" : "pedidos"));
    } catch (e) {
      setError(e?.message ?? "No se pudo cargar los traspasos de efectivo");
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canRequest = !!data?.can_request;
  const isCollector = !!data?.collector_id;
  const current = tab === "recibidos" ? data?.as_collector || [] : data?.as_requester || [];

  const close = () => { setModal(null); setActive(null); setModalError(""); };

  const openRequest = async () => {
    setModal("request");
    setActive(null);
    setCollectorId(null);
    setAmountText("");
    setNotes("");
    setModalError("");
    try {
      const res = await getRequestableCollectors(session.token);
      setCollectors(res?.data || []);
    } catch (e) {
      setCollectors([]);
      setModalError(e?.message ?? "No se pudo cargar los cobradores");
    }
  };

  const openSend = (item) => {
    setActive(item);
    setModal("send");
    setAmountText(formatAmountInput(String(item.amount_requested)));
    setNotes("");
    setModalError("");
  };

  const openText = (item, kind) => {
    setActive(item);
    setModal(kind);
    setNotes("");
    setModalError("");
  };

  // Ejecuta una acción de dinero: una sola a la vez y recarga al terminar.
  const run = async (fn, okMessage) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      setSaving(true);
      setModalError("");
      const res = await fn();
      close();
      setNotice(res?.message || okMessage);
      load();
    } catch (e) {
      setModalError(e?.message ?? "No se pudo completar la acción");
      setError("");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submitRequest = () => {
    const amount = toNumber(amountText);
    if (!collectorId) return setModalError("Elija el cobrador.");
    if (!(amount > 0)) return setModalError("Escriba el monto que necesita.");
    const name = collectors.find((c) => c.id === collectorId)?.name;
    confirmAction("Pedir efectivo", `¿Pedir ${money(amount)} a ${name}?`, () =>
      run(() => requestCashHandoff(session.token, { collectorId, amount, notes }), "Solicitud enviada"));
  };

  const submitSend = () => {
    const amount = toNumber(amountText);
    if (!(amount > 0)) return setModalError("Escriba el monto que va a transferir.");
    confirmAction("Transferir efectivo", `¿Confirmás que le entregaste ${money(amount)} a ${active?.requester_name}? Ese dinero sale de lo que tenés que entregar a la oficina.`, () =>
      run(() => sendCashHandoff(session.token, active.id, { amount, notes }), "Transferencia registrada"));
  };

  const submitDecline = () => {
    if (notes.trim().length < 3) return setModalError("Escribí el motivo (al menos 3 letras).");
    run(() => declineCashHandoff(session.token, active.id, notes.trim()), "Solicitud rechazada");
  };

  const submitNotReceived = () => {
    if (notes.trim().length < 5) return setModalError("Explicá qué pasó (al menos 5 letras).");
    confirmAction("No lo recibí", "El dinero vuelve a la custodia del cobrador y la oficina lo revisará. ¿Confirmás que NO lo recibiste?", () =>
      run(() => notReceivedCashHandoff(session.token, active.id, notes.trim()), "Reportado como no recibido"), { destructive: true });
  };

  const confirmReceived = (item) =>
    confirmAction("Confirmar recibido", `¿Confirmás que recibiste ${money(item.amount_sent)} de ${item.collector_name}? Entrarán a tu caja de campo.`, () =>
      run(() => confirmCashHandoff(session.token, item.id), "Recibido"));

  const cancelRequest = (item) =>
    confirmAction("Cancelar solicitud", `¿Cancelar la solicitud de ${money(item.amount_requested)} a ${item.collector_name}?`, () =>
      run(() => cancelCashHandoff(session.token, item.id), "Solicitud cancelada"));

  const renderItem = ({ item }) => {
    const asCollector = tab === "recibidos";
    const who = asCollector ? item.requester_name : item.collector_name;
    const amount = item.amount_sent ?? item.amount_requested;
    return (
      <Card style={styles.row}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{asCollector ? `Te lo pide: ${who}` : `Se lo pediste a: ${who}`}</Text>
          <Text style={styles.amount}>{money(amount)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: SPACING.xs }}>
          <Chip compact style={{ backgroundColor: COLORS.primarySoft }} textStyle={{ color: STATUS_COLOR[item.status] || COLORS.text, fontWeight: "700" }}>
            {item.status_label}
          </Chip>
        </View>
        {item.amount_sent != null && item.amount_sent !== item.amount_requested && (
          <Text style={styles.muted}>Pedido: {money(item.amount_requested)}</Text>
        )}
        {!!item.request_notes && <Text style={styles.muted}>Nota: {item.request_notes}</Text>}
        {!!item.response_notes && (
          <Text style={[styles.muted, { color: COLORS.danger }]}>
            {item.rejected_by_role === "DESEMBOLSADOR" ? "No recibido: " : "Motivo: "}{item.response_notes}
          </Text>
        )}
        <Text style={styles.muted}>
          Pedido: {when(item.created_at)}
          {item.sent_at ? ` · Entregado: ${when(item.sent_at)}` : ""}
          {item.confirmed_at ? ` · Recibido: ${when(item.confirmed_at)}` : ""}
        </Text>

        {asCollector && item.status === "SOLICITADO" && (
          <View style={styles.actions}>
            <Button mode="text" compact textColor={COLORS.danger} onPress={() => openText(item, "decline")}>No puedo</Button>
            <Button mode="contained" compact onPress={() => openSend(item)} style={{ borderRadius: RADIUS.md }}>Transferir</Button>
          </View>
        )}
        {asCollector && item.status === "ENVIADO" && (
          <Text style={[styles.muted, { color: COLORS.primary }]}>Esperando que {who} confirme que lo recibió.</Text>
        )}
        {!asCollector && item.status === "SOLICITADO" && (
          <View style={styles.actions}>
            <Button mode="text" compact textColor={COLORS.danger} onPress={() => cancelRequest(item)}>Cancelar solicitud</Button>
          </View>
        )}
        {!asCollector && item.status === "ENVIADO" && (
          <View style={styles.actions}>
            <Button mode="text" compact textColor={COLORS.danger} onPress={() => openText(item, "notReceived")}>No lo recibí</Button>
            <Button mode="contained" compact onPress={() => confirmReceived(item)} style={{ borderRadius: RADIUS.md }}>Ya lo recibí</Button>
          </View>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Traspaso de efectivo</Text>
      </View>
      <Text style={styles.sub}>El desembolsador pide, el cobrador transfiere y el desembolsador confirma</Text>

      {canRequest && isCollector && (
        <SegmentedButtons
          value={tab || "pedidos"}
          onValueChange={setTab}
          buttons={[{ value: "pedidos", label: "Mis solicitudes" }, { value: "recibidos", label: "Me piden" }]}
          style={{ marginHorizontal: SPACING.lg, marginBottom: SPACING.sm }}
        />
      )}
      {tab === "recibidos" && data?.custody != null && (
        <Text style={[styles.sub, { color: COLORS.text }]}>Tenés por entregar a la oficina: {money(Math.max(0, data.custody))}</Text>
      )}

      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>
      {!!notice && (
        <Card style={{ marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.primarySoft }}>
          <Text style={{ color: COLORS.text }}>{notice}</Text>
        </Card>
      )}
      {tab !== "recibidos" && canRequest && (
        <Button mode="contained" icon="cash-plus" onPress={openRequest} style={{ marginHorizontal: SPACING.lg, borderRadius: RADIUS.md }}>
          Pedir efectivo a un cobrador
        </Button>
      )}
      {loading && !data && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {data && (
        <FlatList
          data={current}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          onRefresh={load}
          refreshing={loading}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === "recibidos" ? "Nadie te ha pedido efectivo." : canRequest ? "Todavía no pedís efectivo a ningún cobrador." : "No tenés traspasos de efectivo."}
            </Text>
          }
          renderItem={renderItem}
        />
      )}

      <Portal>
        <Modal visible={!!modal} onDismiss={close} contentContainerStyle={modalStyle}>
          <KeyboardAwareScroll style={{ maxHeight: 520 }}>
            {modal === "request" && (
              <>
                <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text }}>Pedir efectivo</Text>
                <Text style={{ color: COLORS.text, fontWeight: "700", marginTop: SPACING.md }}>¿A qué cobrador?</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs }}>
                  {collectors.map((c) => (
                    <Chip key={c.id} selected={collectorId === c.id} onPress={() => setCollectorId(c.id)}
                      style={{ backgroundColor: collectorId === c.id ? COLORS.primarySoft : COLORS.bg }}>
                      {c.name}
                    </Chip>
                  ))}
                  {!collectors.length && !modalError && <Text style={styles.muted}>No hay cobradores a quienes pedirles.</Text>}
                </View>
                <TextInput mode="outlined" label="Monto (C$)" value={amountText} keyboardType="decimal-pad"
                  onChangeText={(t) => setAmountText(formatAmountInput(t))}
                  style={{ backgroundColor: COLORS.card, marginTop: SPACING.md }} outlineStyle={{ borderRadius: RADIUS.md }} />
                <TextInput mode="outlined" label="Nota (opcional)" value={notes} onChangeText={setNotes} multiline
                  style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }} outlineStyle={{ borderRadius: RADIUS.md }} />
                <HelperText type="error" visible={!!modalError}>{modalError}</HelperText>
                <Button mode="contained" onPress={submitRequest} loading={saving} disabled={saving}
                  style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
                  Enviar solicitud
                </Button>
              </>
            )}

            {modal === "send" && (
              <>
                <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text }}>Transferir efectivo</Text>
                <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                  {active?.requester_name} te pidió {money(active?.amount_requested)}. Entregale el efectivo y confirmalo acá.
                </Text>
                <TextInput mode="outlined" label="Monto que le entregás (C$)" value={amountText} keyboardType="decimal-pad"
                  onChangeText={(t) => setAmountText(formatAmountInput(t))}
                  style={{ backgroundColor: COLORS.card, marginTop: SPACING.md }} outlineStyle={{ borderRadius: RADIUS.md }} />
                <Text style={styles.muted}>Podés entregar menos de lo pedido, no más.</Text>
                <TextInput mode="outlined" label="Nota (opcional)" value={notes} onChangeText={setNotes} multiline
                  style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }} outlineStyle={{ borderRadius: RADIUS.md }} />
                <HelperText type="error" visible={!!modalError}>{modalError}</HelperText>
                <Button mode="contained" onPress={submitSend} loading={saving} disabled={saving}
                  style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
                  Ya le entregué el efectivo
                </Button>
              </>
            )}

            {(modal === "decline" || modal === "notReceived") && (
              <>
                <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.danger }}>
                  {modal === "decline" ? "No puedo darle efectivo" : "No lo recibí"}
                </Text>
                <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                  {modal === "decline" ? `${active?.requester_name} · ${money(active?.amount_requested)}` : `${active?.collector_name} · ${money(active?.amount_sent)}`}
                </Text>
                <TextInput mode="outlined" label={modal === "decline" ? "Motivo" : "¿Qué pasó?"} value={notes} onChangeText={setNotes} multiline
                  style={{ backgroundColor: COLORS.card, marginTop: SPACING.md }} outlineStyle={{ borderRadius: RADIUS.md }} />
                <HelperText type="error" visible={!!modalError}>{modalError}</HelperText>
                <Button mode="contained" buttonColor={COLORS.danger} onPress={modal === "decline" ? submitDecline : submitNotReceived}
                  loading={saving} disabled={saving} style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
                  {modal === "decline" ? "Rechazar solicitud" : "Reportar no recibido"}
                </Button>
              </>
            )}
          </KeyboardAwareScroll>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}
