import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { Text, Divider } from "react-native-paper";
import AddressLines from "./AddressLines";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  muted: { color: COLORS.muted, marginTop: 2 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
});

// Comprobante de pago (las dos tarjetas que se comparten como imagen): quién
// pagó, a qué crédito y cómo se aplicó el monto. Lo usan el paso final de
// "Registrar pago" y la reimpresión desde "Mis cobros". Se pone dentro de un
// ViewShot para capturarlo. Los saldos son opcionales: un cobro antiguo no los
// guarda y simplemente no se muestran.
export default function PaymentReceiptCard({
  tenantName,
  logoUrl,
  pendingOffline = false,
  copy = false,
  customer,
  loanLabel,
  date,
  collectorName,
  amount,
  rows = [],
  principalBefore,
  principalAfter,
  newBalance,
}) {
  const title = pendingOffline ? "COMPROBANTE (PENDIENTE DE SINCRONIZAR)" : copy ? "COMPROBANTE DE PAGO (COPIA)" : "COMPROBANTE DE PAGO";
  return (
    <>
      <View style={styles.card}>
        {!!logoUrl && (
          <Image source={{ uri: logoUrl }} style={{ width: 120, height: 40, alignSelf: "flex-start", marginBottom: SPACING.xs }} resizeMode="contain" />
        )}
        <Text style={{ fontWeight: "800", color: COLORS.primary, fontSize: 12, letterSpacing: 1 }}>
          {logoUrl ? "" : `${String(tenantName || "CrediMaster").toUpperCase()} — `}
          {title}
        </Text>
        <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text, marginTop: 2 }}>
          {customer?.customer_name}
        </Text>
        {!!customer?.identification && <Text style={styles.muted}>Cédula: {customer.identification}</Text>}
        <AddressLines customer={customer} showMissing={false} />
        <Text style={styles.muted}>Crédito #{loanLabel}</Text>
        <Text style={styles.muted}>Fecha: {date}</Text>
        <Text style={styles.muted}>Cobrado por: {collectorName}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.breakdownRow}>
          <Text style={{ color: COLORS.text, fontWeight: "800" }}>Monto pagado</Text>
          <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 18 }}>{money(amount)}</Text>
        </View>
        {rows.length > 0 && (
          <>
            <Divider style={{ marginVertical: SPACING.xs }} />
            {rows.map((r) => (
              <View key={r.label} style={styles.breakdownRow}>
                <Text style={{ color: COLORS.muted }}>{r.label}</Text>
                <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(r.value)}</Text>
              </View>
            ))}
          </>
        )}
        {principalBefore != null && (
          <>
            <Divider style={{ marginVertical: SPACING.xs }} />
            <View style={styles.breakdownRow}>
              <Text style={{ color: COLORS.muted }}>Saldo capital anterior</Text>
              <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(principalBefore)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={{ color: COLORS.muted }}>Saldo capital nuevo</Text>
              <Text style={{ color: COLORS.text, fontWeight: "600" }}>{money(principalAfter)}</Text>
            </View>
          </>
        )}
        {newBalance != null && (
          <>
            <Divider style={{ marginVertical: SPACING.xs }} />
            <View style={styles.breakdownRow}>
              <Text style={{ color: COLORS.muted }}>Nuevo saldo total</Text>
              <Text style={{ color: COLORS.text, fontWeight: "700" }}>{money(newBalance)}</Text>
            </View>
          </>
        )}
      </View>
    </>
  );
}
