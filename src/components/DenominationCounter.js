import React from "react";
import { View, StyleSheet, TextInput, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  label: { width: 78, color: COLORS.text, fontWeight: "700" },
  step: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
  },
  input: {
    width: 58,
    height: 34,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    textAlign: "center",
    color: COLORS.text,
    backgroundColor: COLORS.card,
    paddingVertical: 0,
  },
  subtotal: { flex: 1, textAlign: "right", color: COLORS.muted, fontSize: 12 },
  subtotalOn: { color: COLORS.text, fontWeight: "700" },
});

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Cantidad entera >= 0 a partir de lo que escribió el usuario.
const toQty = (text) => {
  const n = parseInt(String(text).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? Math.min(n, 999999) : 0;
};

// Total de un conteo { "1000": 2, "0.5": 3 } en la moneda del conteo.
export const countTotal = (counts) =>
  round2(Object.entries(counts || {}).reduce((sum, [value, qty]) => sum + Number(value) * (Number(qty) || 0), 0));

// Conteo sin cantidades en cero, como lo espera el servidor.
export const cleanCounts = (counts) =>
  Object.fromEntries(Object.entries(counts || {}).filter(([, qty]) => Number(qty) > 0));

const label = (symbol, value) =>
  `${symbol} ${value < 1 ? value.toFixed(2) : value.toLocaleString("es-NI")}`;

// Conteo de billetes y monedas de una moneda: una fila por denominación con
// botones -/+ y la cantidad editable. `counts` es { "<denominación>": cantidad }.
export default function DenominationCounter({ symbol, denominations, counts, onChange }) {
  const setQty = (value, qty) => onChange({ ...counts, [String(value)]: Math.max(0, qty) });

  return (
    <View style={styles.wrap}>
      {denominations.map((value) => {
        const qty = Number(counts?.[String(value)]) || 0;
        return (
          <View key={value} style={styles.row}>
            <Text style={styles.label}>{label(symbol, value)}</Text>
            <Pressable style={styles.step} onPress={() => setQty(value, qty - 1)} accessibilityLabel={`Quitar ${label(symbol, value)}`}>
              <MaterialCommunityIcons name="minus" size={18} color={COLORS.text} />
            </Pressable>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={qty ? String(qty) : ""}
              placeholder="0"
              placeholderTextColor={COLORS.muted}
              onChangeText={(t) => setQty(value, toQty(t))}
              selectTextOnFocus
              accessibilityLabel={`Cantidad de ${label(symbol, value)}`}
            />
            <Pressable style={styles.step} onPress={() => setQty(value, qty + 1)} accessibilityLabel={`Agregar ${label(symbol, value)}`}>
              <MaterialCommunityIcons name="plus" size={18} color={COLORS.text} />
            </Pressable>
            <Text style={[styles.subtotal, qty ? styles.subtotalOn : null]}>
              {qty ? (value * qty).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
