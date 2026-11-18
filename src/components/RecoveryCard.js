import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getMyRecovery } from "../api/collectionsApi";
import { cachedFetch } from "../offline/cache";
import OfflineNotice from "./OfflineNotice";
import { todayISO } from "../utils/date";
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
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  label: { color: COLORS.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  total: { color: COLORS.text, fontWeight: "800", fontSize: 28 },
  divider: { height: 1, backgroundColor: COLORS.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm },
  rowLabel: { color: COLORS.text, flexShrink: 1 },
  bar: { height: 8, borderRadius: 4, backgroundColor: COLORS.border, overflow: "hidden" },
});

// Colores pedidos por CREDILIX: día verde, mora naranja, vencido rojo, adelanto azul.
const ROWS = [
  { key: "day", label: "Monto del día", color: COLORS.success },
  { key: "overdue", label: "Monto en mora", color: "#EA580C" },
  { key: "matured", label: "Monto vencido", color: COLORS.danger },
  { key: "advance", label: "Monto adelantado", color: COLORS.primary },
];

// Recuperación de hoy del gestor (Inicio): total cobrado, número de pagos y cuánto fue del día, de mora, de crédito
// vencido y adelantado. Solo para usuarios vinculados a un cobrador; sin vínculo o sin datos no muestra nada. Sin señal
// muestra la última copia del día, avisando de la hora. Los pagos guardados sin señal se cuentan cuando se envían.
export default function RecoveryCard() {
  const { session } = useContext(SessionContext);
  const [info, setInfo] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const today = todayISO();
      cachedFetch(`myRecovery:${session?.user?.id}`, () => getMyRecovery(session.token, today))
        .then(({ data, cachedAt }) => {
          if (cancelled) return;
          // La copia de otro día no sirve: la tarjeta es "de hoy".
          setInfo(data?.linked && data.date === today ? { data, cachedAt } : null);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [session?.token, session?.user?.id]),
  );

  if (!info) return null;
  const { data: r, cachedAt } = info;
  const total = Number(r.total) || 0;
  const rows = [...ROWS, ...(Number(r.unclassified) > 0.009 ? [{ key: "unclassified", label: "Sin clasificar", color: COLORS.muted }] : [])];

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.label}>TOTAL RECUPERACIÓN DE HOY</Text>
        <Text style={styles.total}>{money(total)}</Text>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Número de pagos realizados</Text>
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 18 }}>{Number(r.payments_count) || 0}</Text>
        </View>
        <OfflineNotice cachedAt={cachedAt} />
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>RECUPERACIÓN</Text>
        {rows.map((row) => {
          const value = Number(r[row.key]) || 0;
          const pct = total > 0 ? Math.min(100, Math.max(value > 0 ? 2 : 0, (value / total) * 100)) : 0;
          return (
            <View key={row.key} style={{ gap: 4 }}>
              <View style={styles.row}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, flexShrink: 1 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: row.color }} />
                  <Text style={styles.rowLabel}>{row.label}</Text>
                </View>
                <Text style={{ color: row.color, fontWeight: "800", fontSize: 16 }}>{money(value)}</Text>
              </View>
              <View style={styles.bar}>
                <View style={{ width: `${pct}%`, height: 8, backgroundColor: row.color }} />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}
