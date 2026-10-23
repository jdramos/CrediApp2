import React, { useCallback, useContext, useRef, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getPortfolioSummary, getPortfolioByMonth } from "../api/financeApi";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Umbrales del semáforo de mora (vencida / cartera total), en %: hasta MORA_OK
// verde, hasta MORA_ALERT ámbar y por encima rojo. Referencia de gestión, no una
// norma: ajustables aquí.
const MORA_OK = 5;
const MORA_ALERT = 10;
const REFRESH_MS = 5 * 60 * 1000;

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    ...SHADOW.card,
  },
  light: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { color: COLORS.muted, fontSize: 12 },
  big: { fontWeight: "800", fontSize: 20 },
  sub: { color: COLORS.muted, fontSize: 12 },
});

const compact = (n) => {
  const v = Number(n) || 0;
  return Math.abs(v) >= 1e6 ? `C$${(v / 1e6).toFixed(2)} M` : money(v);
};

// Resumen de la cartera para el Inicio, con semáforo de mora y el cambio contra el
// cierre del mes anterior. Solo para quien tiene balances.ver (lo decide el
// Inicio); un toque abre Finanzas. Si no se puede cargar, no muestra nada.
export default function FinanceGlance() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [info, setInfo] = useState(null);
  const lastLoad = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoad.current < REFRESH_MS && info) return undefined;
      let cancelled = false;
      Promise.all([getPortfolioSummary(session.token), getPortfolioByMonth(session.token).catch(() => null)])
        .then(([summary, byMonth]) => {
          if (cancelled || !summary?.data) return;
          lastLoad.current = Date.now();
          const rows = byMonth?.data || [];
          // El último mes de la serie es el actual: el anterior es el penúltimo.
          const prevRow = rows.length >= 2 ? rows[rows.length - 2] : null;
          const prevRate = prevRow && Number(prevRow.total_portfolio) > 0 ? (Number(prevRow.overdue_portfolio) / Number(prevRow.total_portfolio)) * 100 : null;
          setInfo({ summary: summary.data, prevRate });
        })
        .catch(() => {}); // sin conexión o sin datos: la tarjeta simplemente no aparece
      return () => {
        cancelled = true;
      };
    }, [session.token, info]),
  );

  if (!info) return null;
  const { summary: s, prevRate } = info;
  const rate = Number(s.overdue_rate) || 0;
  const color = rate <= MORA_OK ? COLORS.success : rate <= MORA_ALERT ? COLORS.warning : COLORS.danger;
  const word = rate <= MORA_OK ? "Mora baja" : rate <= MORA_ALERT ? "Mora en observación" : "Mora alta";
  const diff = prevRate == null ? null : rate - prevRate;

  return (
    <Pressable style={styles.card} onPress={() => navigation.navigate("Finance")} accessibilityRole="button" accessibilityLabel="Ver finanzas">
      <View style={[styles.light, { backgroundColor: color }]}>
        <MaterialCommunityIcons name="chart-line" size={22} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{word} · cartera {compact(s.total_portfolio)}</Text>
        <Text style={[styles.big, { color }]}>{rate.toFixed(2)}% de mora</Text>
        <Text style={styles.sub}>
          Vencida {compact(s.overdue_portfolio)}
          {diff != null && Math.abs(diff) >= 0.005 ? ` · ${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(2)} pts vs mes anterior` : ""}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.muted} />
    </Pressable>
  );
}
