import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { Text } from "react-native-paper";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 2,
    ...SHADOW.card,
  },
  logo: { width: 120, height: 40, alignSelf: "flex-start", marginBottom: SPACING.xs },
  brand: { fontWeight: "800", color: COLORS.primary, fontSize: 12, letterSpacing: 1 },
  title: { fontWeight: "800", color: COLORS.text, marginTop: 2 },
  muted: { color: COLORS.muted },
});

// Encabezado de las imágenes que se comparten por WhatsApp (resumen del día,
// cierre del día): logo o nombre del tenant, título y quién/cuándo. Va DENTRO
// del ViewShot que se captura, así la imagen compartida se entiende sola.
export default function ShareCardHeader({ logoUrl, tenantName, title, lines = [] }) {
  return (
    <View style={styles.card}>
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" />
      ) : (
        <Text style={styles.brand}>{(tenantName || "CrediMaster").toUpperCase()}</Text>
      )}
      <Text variant="titleLarge" style={styles.title}>{title}</Text>
      {lines.filter(Boolean).map((l) => (
        <Text key={l} style={styles.muted}>{l}</Text>
      ))}
    </View>
  );
}
