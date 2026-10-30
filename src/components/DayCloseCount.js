import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Button, Portal, Modal, TextInput, HelperText } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { submitMyDayClose } from "../api/collectionsApi";
import { confirmAction } from "../utils/confirm";
import { money, usd } from "../utils/format";
import DenominationCounter, { countTotal, cleanCounts } from "./DenominationCounter";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const TOLERANCE = 0.005;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  title: { fontWeight: "800", color: COLORS.text },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  label: { color: COLORS.muted, flexShrink: 1 },
  value: { color: COLORS.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  muted: { color: COLORS.muted, fontSize: 12 },
  banner: { flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start", borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.md },
  bannerText: { flex: 1, fontWeight: "600" },
  modal: { backgroundColor: COLORS.bg, margin: SPACING.md, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "94%" },
  section: { fontWeight: "800", color: COLORS.text, marginTop: SPACING.md, marginBottom: SPACING.xs },
  summary: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 4,
    marginTop: SPACING.md,
  },
});

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const STATUS = {
  PENDIENTE: { icon: "clock-outline", color: COLORS.warning, bg: COLORS.warningSoft, text: "Cierre enviado. Está pendiente de aprobación de la oficina." },
  APROBADO: { icon: "check-circle-outline", color: COLORS.success, bg: COLORS.successSoft, text: "Cierre aprobado por la oficina." },
};

// Línea "Cuadra / Sobran / Faltan" de una moneda.
function DiffLine({ label, diff, fmt }) {
  const short = diff < -TOLERANCE;
  const over = diff > TOLERANCE;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: short ? COLORS.danger : over ? COLORS.warning : COLORS.success }]}>
        {short ? `Faltan ${fmt(-diff)}` : over ? `Sobran ${fmt(diff)}` : "Cuadra exacto"}
      </Text>
    </View>
  );
}

// Arqueo del cierre del día: el cobrador cuenta su efectivo por denominación y
// el cierre solo se guarda si cuadra o sobra (el servidor valida lo mismo).
// La oficina lo revisa y aprueba desde la web. Sin efectivo ese día se cierra
// sin contar.
export default function DayCloseCount({ token, date, cashCount, pendingCashAmount = 0, onSaved }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ NIO: {}, USD: {} });
  const [showUsd, setShowUsd] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const expectedNio = round2(cashCount?.expected_nio);
  const expectedUsd = round2(cashCount?.expected_usd);
  const hasCash = expectedNio > 0 || expectedUsd > 0;
  const withUsd = expectedUsd > 0 || showUsd;
  const close = cashCount?.close;
  const needsClose = !!cashCount?.needs_close;

  const countedNio = useMemo(() => countTotal(counts.NIO), [counts.NIO]);
  const countedUsd = useMemo(() => countTotal(counts.USD), [counts.USD]);
  const diffNio = round2(countedNio - expectedNio);
  const diffUsd = round2(countedUsd - expectedUsd);
  const shortage = diffNio < -TOLERANCE || diffUsd < -TOLERANCE;

  if (!cashCount) return null;

  const openCount = () => {
    setCounts({ NIO: {}, USD: {} });
    setShowUsd(false);
    setNotes("");
    setError("");
    setOpen(true);
  };

  const save = async () => {
    try {
      setSaving(true);
      setError("");
      await submitMyDayClose(token, {
        date,
        denominations: { NIO: cleanCounts(counts.NIO), USD: cleanCounts(counts.USD) },
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setError(e?.message ?? "No se pudo guardar el cierre. Revisá tu conexión.");
    } finally {
      setSaving(false);
    }
  };

  const confirmSave = () => {
    if (shortage) return;
    const over = [];
    if (diffNio > TOLERANCE) over.push(`${money(diffNio)}`);
    if (diffUsd > TOLERANCE) over.push(usd(diffUsd));
    confirmAction(
      "Guardar cierre del día",
      over.length ? `Te sobran ${over.join(" y ")}. ¿Guardás el cierre con ese sobrante?` : "El efectivo cuadra. ¿Guardás el cierre del día?",
      save,
    );
  };

  const closeWithoutCash = () =>
    confirmAction("Cerrar el día", "No cobraste efectivo este día. ¿Cerrás el día sin efectivo?", async () => {
      try {
        setSaving(true);
        setError("");
        await submitMyDayClose(token, { date, denominations: { NIO: {}, USD: {} } });
        onSaved?.();
      } catch (e) {
        setError(e?.message ?? "No se pudo guardar el cierre. Revisá tu conexión.");
      } finally {
        setSaving(false);
      }
    });

  const status = close && !needsClose ? STATUS[close.status] : null;
  const rejected = close?.status === "RECHAZADO";
  const unsent = pendingCashAmount > 0;

  return (
    <View style={styles.card}>
      <Text variant="titleMedium" style={styles.title}>Arqueo del día</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Efectivo cobrado (C$)</Text>
        <Text style={styles.value}>{money(expectedNio)}</Text>
      </View>
      {expectedUsd > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>Dólares cobrados (US$)</Text>
          <Text style={styles.value}>{usd(expectedUsd)}</Text>
        </View>
      )}

      {status && (
        <View style={[styles.banner, { backgroundColor: status.bg, borderColor: status.color }]}>
          <MaterialCommunityIcons name={status.icon} size={20} color={status.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerText, { color: status.color }]}>{status.text}</Text>
            <Text style={styles.muted}>
              Contado {money(close.counted_nio)}
              {close.counted_usd > 0 ? ` y ${usd(close.counted_usd)}` : ""}
              {close.difference_nio > TOLERANCE ? ` · sobrante ${money(close.difference_nio)}` : ""}
              {close.difference_usd > TOLERANCE ? ` · sobrante ${usd(close.difference_usd)}` : ""}
            </Text>
            {!!close.review_notes && <Text style={styles.muted}>Nota de la oficina: {close.review_notes}</Text>}
          </View>
        </View>
      )}

      {rejected && (
        <View style={[styles.banner, { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger }]}>
          <MaterialCommunityIcons name="close-circle-outline" size={20} color={COLORS.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerText, { color: COLORS.danger }]}>La oficina rechazó el cierre. Volvé a contar.</Text>
            {!!close.review_notes && <Text style={styles.muted}>Motivo: {close.review_notes}</Text>}
          </View>
        </View>
      )}

      {cashCount.stale && (
        <View style={[styles.banner, { backgroundColor: COLORS.warningSoft, borderColor: COLORS.warning }]}>
          <MaterialCommunityIcons name="alert-outline" size={20} color={COLORS.warning} />
          <Text style={[styles.bannerText, { color: COLORS.warning }]}>
            El efectivo del día cambió después de tu cierre. Volvé a contar y cerrar.
          </Text>
        </View>
      )}

      {unsent && needsClose && (
        <View style={[styles.banner, { backgroundColor: COLORS.warningSoft, borderColor: COLORS.warning }]}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={20} color={COLORS.warning} />
          <Text style={[styles.bannerText, { color: COLORS.warning }]}>
            Tenés {money(pendingCashAmount)} en efectivo sin enviar. Envialos (cuando vuelva la señal) antes de cerrar el día.
          </Text>
        </View>
      )}

      {!!error && !open && <HelperText type="error" visible>{error}</HelperText>}

      {needsClose && (
        hasCash ? (
          <Button mode="contained" icon="cash-multiple" onPress={openCount} disabled={unsent} style={{ borderRadius: RADIUS.md }}>
            {rejected || cashCount.stale ? "Volver a contar y cerrar" : "Contar efectivo y cerrar el día"}
          </Button>
        ) : (
          <Button mode="contained" icon="check" onPress={closeWithoutCash} loading={saving} disabled={saving || unsent} style={{ borderRadius: RADIUS.md }}>
            Cerrar el día (sin efectivo)
          </Button>
        )
      )}

      <Portal>
        <Modal visible={open} onDismiss={() => !saving && setOpen(false)} contentContainerStyle={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text variant="titleLarge" style={styles.title}>Arqueo por denominación</Text>
            <Text style={styles.muted}>Contá billete por billete y moneda por moneda. Solo se guarda si cuadra o te sobra.</Text>

            <View style={styles.summary}>
              <View style={styles.row}>
                <Text style={styles.label}>Debés tener (C$)</Text>
                <Text style={styles.value}>{money(expectedNio)}</Text>
              </View>
              {expectedUsd > 0 && (
                <View style={styles.row}>
                  <Text style={styles.label}>Debés tener (US$)</Text>
                  <Text style={styles.value}>{usd(expectedUsd)}</Text>
                </View>
              )}
            </View>

            <Text style={styles.section}>Córdobas (C$)</Text>
            <DenominationCounter
              symbol="C$"
              denominations={cashCount.denominations.NIO}
              counts={counts.NIO}
              onChange={(next) => setCounts((c) => ({ ...c, NIO: next }))}
            />

            {withUsd ? (
              <>
                <Text style={styles.section}>Dólares (US$)</Text>
                <DenominationCounter
                  symbol="US$"
                  denominations={cashCount.denominations.USD}
                  counts={counts.USD}
                  onChange={(next) => setCounts((c) => ({ ...c, USD: next }))}
                />
              </>
            ) : (
              <Button compact icon="currency-usd" onPress={() => setShowUsd(true)} style={{ alignSelf: "flex-start", marginTop: SPACING.sm }}>
                Tengo dólares
              </Button>
            )}

            <View style={styles.summary}>
              <View style={styles.row}>
                <Text style={styles.label}>Contado (C$)</Text>
                <Text style={styles.value}>{money(countedNio)}</Text>
              </View>
              <DiffLine label="Resultado C$" diff={diffNio} fmt={money} />
              {withUsd && (
                <>
                  <View style={styles.row}>
                    <Text style={styles.label}>Contado (US$)</Text>
                    <Text style={styles.value}>{usd(countedUsd)}</Text>
                  </View>
                  <DiffLine label="Resultado US$" diff={diffUsd} fmt={usd} />
                </>
              )}
            </View>

            {shortage && (
              <Text style={{ color: COLORS.danger, marginTop: SPACING.sm }}>
                No se puede guardar con faltante. Revisá el conteo o buscá la diferencia antes de cerrar.
              </Text>
            )}

            <TextInput
              mode="outlined"
              label="Nota (opcional)"
              value={notes}
              onChangeText={setNotes}
              maxLength={500}
              multiline
              style={{ backgroundColor: COLORS.card, marginTop: SPACING.md }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />

            <HelperText type="error" visible={!!error}>{error}</HelperText>

            <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm }}>
              <Button mode="outlined" onPress={() => setOpen(false)} disabled={saving} style={{ flex: 1, borderRadius: RADIUS.md }}>
                Cancelar
              </Button>
              <Button
                mode="contained"
                onPress={confirmSave}
                loading={saving}
                disabled={saving || shortage}
                style={{ flex: 1, borderRadius: RADIUS.md }}
              >
                Guardar cierre
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
}
