import React, { useContext, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Button, Portal, Modal, ActivityIndicator, Divider } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../auth/SessionContext";
import { getPayoff } from "../api/paymentApi";
import { useTenantLogo } from "../hooks/useTenantLogo";
import ShareCardHeader from "./ShareCardHeader";
import { shareImage } from "../utils/shareImage";
import { money } from "../utils/format";
import { todayISO } from "../utils/date";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  modal: { backgroundColor: COLORS.bg, margin: SPACING.md, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "92%" },
  shot: { gap: SPACING.md, backgroundColor: COLORS.bg },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 2,
    ...SHADOW.card,
  },
  bigLabel: { color: COLORS.muted, fontSize: 12 },
  bigValue: { color: COLORS.primary, fontWeight: "800", fontSize: 30 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  note: { color: COLORS.muted, fontSize: 11, textAlign: "center" },
  error: { color: COLORS.danger, marginVertical: SPACING.sm },
});

// Concepto -> nombre; capital e interés se muestran siempre, el resto solo si aplica.
const ROWS = [
  ["principal", "Capital", true],
  ["interest", "Interés", true],
  ["defaulted_interest", "Interés moratorio", false],
  ["insurance", "Seguro", false],
  ["fee", "Comisión", false],
  ["other_charges", "Otros cargos", false],
];

// Cuánto debe pagar HOY el cliente para cancelar el crédito completo: el
// servidor calcula el saldo exacto (capital + interés a hoy + mora + cargos) con
// la misma lógica con la que valida un pago real. Se puede compartir como
// imagen. El interés sigue corriendo cada día, por eso la cifra es solo de hoy.
export default function PayoffModal({ loan, onDismiss }) {
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);

  const loanId = loan?.loan_id;
  useEffect(() => {
    if (!loanId) return undefined;
    let cancelled = false;
    setData(null);
    setError("");
    setLoading(true);
    getPayoff(session.token, loanId, todayISO())
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setError(e?.message || "No se pudo calcular el saldo"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [loanId, session.token]);

  const onShare = async () => {
    try {
      setSharing(true);
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Saldo para cancelar");
    } catch (e) {
      setError(e?.message ?? "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name;

  return (
    <Portal>
      <Modal visible={!!loan} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        {loan && (
          <>
            {loading && <ActivityIndicator style={{ marginVertical: SPACING.xl }} />}
            {!!error && !loading && <Text style={styles.error}>{error}</Text>}

            {data && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={styles.shot}>
                  <ShareCardHeader
                    logoUrl={logoUrl}
                    tenantName={tenantName}
                    title="Saldo para cancelar"
                    lines={[loan.customer_name, `Crédito #${loan.credit_code || loan.loan_id}`, `Al ${todayISO()}`]}
                  />
                  <View style={styles.card}>
                    <Text style={styles.bigLabel}>Para cancelar el crédito hoy</Text>
                    <Text style={styles.bigValue}>{money(data.total)}</Text>
                    <Divider style={{ marginVertical: SPACING.xs }} />
                    {ROWS.filter(([key, , always]) => always || Number(data.applied?.[key]) > 0).map(([key, label]) => (
                      <View key={key} style={styles.row}>
                        <Text style={{ color: COLORS.muted }}>{label}</Text>
                        <Text style={{ color: COLORS.text, fontWeight: "700" }}>{money(data.applied?.[key])}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.note}>Válido solo para hoy: el interés se sigue acumulando cada día.</Text>
                </ViewShot>
              </ScrollView>
            )}

            <View style={{ flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.sm }}>
              {data && (
                <Button mode="outlined" icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} style={{ flex: 1, borderRadius: RADIUS.md }}>
                  Compartir
                </Button>
              )}
              <Button mode="contained" onPress={onDismiss} style={{ flex: 1, borderRadius: RADIUS.md }}>
                Cerrar
              </Button>
            </View>
          </>
        )}
      </Modal>
    </Portal>
  );
}
