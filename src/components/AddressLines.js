import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../theme/colors";
import { SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  wrap: { gap: 2, marginTop: SPACING.xs },
  row: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.xs },
  text: { color: COLORS.muted, fontSize: 12, flex: 1 },
  missing: { color: COLORS.muted, fontSize: 12, fontStyle: "italic", opacity: 0.8 },
});

const clean = (v) => (typeof v === "string" ? v.trim() : "");

// Dirección de la casa y del negocio del cliente (customers.home_address /
// business_address). Si no hay ninguna, lo dice en vez de omitir la línea,
// para que el cobrador sepa que falta el dato y no que la pantalla no lo trae.
// `showMissing={false}` en lo que se comparte con el cliente (comprobante,
// estado de cuenta): ahí "sin dirección registrada" sobra.
export default function AddressLines({ customer, compact = false, showMissing = true }) {
  const home = clean(customer?.home_address);
  const business = clean(customer?.business_address);

  // Versión de una sola línea para listas densas (agenda): la casa y, si no
  // hay, el negocio; sin mensaje cuando falta.
  if (compact) {
    const one = home || business;
    if (!one) return null;
    return (
      <View style={styles.row}>
        <MaterialCommunityIcons
          name={home ? "home-outline" : "briefcase-outline"}
          size={12}
          color={COLORS.muted}
          style={{ marginTop: 1 }}
        />
        <Text style={styles.text} numberOfLines={1}>{one}</Text>
      </View>
    );
  }

  if (!home && !business) {
    if (!showMissing) return null;
    return (
      <View style={styles.wrap}>
        <Text style={styles.missing}>Sin dirección registrada</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {!!home && (
        <View style={styles.row}>
          <MaterialCommunityIcons name="home-outline" size={14} color={COLORS.muted} style={{ marginTop: 1 }} />
          <Text style={styles.text} numberOfLines={2}>{home}</Text>
        </View>
      )}
      {!!business && business !== home && (
        <View style={styles.row}>
          <MaterialCommunityIcons name="briefcase-outline" size={14} color={COLORS.muted} style={{ marginTop: 1 }} />
          <Text style={styles.text} numberOfLines={2}>{business}</Text>
        </View>
      )}
    </View>
  );
}
