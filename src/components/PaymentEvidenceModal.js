import React, { useContext, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Image } from "react-native";
import { Text, Button, Portal, Modal, ActivityIndicator } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { getPaymentEvidence } from "../api/paymentEvidenceApi";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  modal: {
    backgroundColor: COLORS.card,
    margin: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    maxHeight: "85%",
  },
  title: { fontWeight: "800", color: COLORS.text },
  subtitle: { color: COLORS.muted, marginBottom: SPACING.sm },
  kind: { fontWeight: "700", color: COLORS.text, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  image: {
    width: "100%",
    height: 280,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#FFFFFF",
  },
  muted: { color: COLORS.muted },
  error: { color: COLORS.danger },
});

const KIND_LABEL = { PHOTO: "Foto del cobro", SIGNATURE: "Firma del cliente" };

// Muestra la evidencia (foto y/o firma) de un pago. Las URLs de descarga son
// temporales (15 min), por eso se piden al abrir y no se guardan.
export default function PaymentEvidenceModal({ paymentId, subtitle, onDismiss }) {
  const { session } = useContext(SessionContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!paymentId) return undefined;
    let cancelled = false;
    setItems([]);
    setError("");
    setLoading(true);
    getPaymentEvidence(session.token, paymentId)
      .then((res) => {
        if (!cancelled) setItems(res?.data || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "No se pudo cargar la evidencia. Revisá tu conexión.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paymentId, session.token]);

  return (
    <Portal>
      <Modal visible={!!paymentId} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>Respaldo del cobro</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <ScrollView>
          {loading && <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.lg }} />}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!loading && !error && items.length === 0 && (
            <Text style={styles.muted}>Este pago no tiene foto ni firma.</Text>
          )}
          {items.map((it) => (
            <View key={it.id}>
              <Text style={styles.kind}>{KIND_LABEL[it.kind] || it.kind}</Text>
              <Image source={{ uri: it.url }} style={styles.image} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
        <Button onPress={onDismiss} style={{ marginTop: SPACING.sm }}>Cerrar</Button>
      </Modal>
    </Portal>
  );
}
