import React, { useContext, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import {
  Card,
  Text,
  IconButton,
  Divider,
  ActivityIndicator,
  HelperText,
  TextInput,
  Button,
} from "react-native-paper";

import { SessionContext } from "../auth/SessionContext";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const API = "https://www.nicaraguahosting.com/apptest/listar_saldos.php"; // 👈 tu archivo real

const money = (n) =>
  new Intl.NumberFormat("es-NI", { style: "currency", currency: "NIO" }).format(Number(n || 0));

const toNum = (v) => Number(v || 0);

export default function SaldosListScreen({ route }) {
  const { session } = useContext(SessionContext);

  // ✅ Prioridad: lo que venga en la sesión (más confiable), si no, lo de route.params
  const token = String(session?.token ?? route?.params?.token ?? "");
  const deviceId = String(session?.deviceId ?? route?.params?.deviceId ?? "");
  const codOfi = String(session?.user?.codOfi ?? route?.params?.codOfi ?? "");
  const rol = String(session?.user?.rol ?? route?.params?.rol ?? "");
  const numSuc = String(session?.user?.numSuc ?? route?.params?.numSuc ?? "");


  console.log("SESSION CHECK:", {
  token,
  deviceId,
  codOfi,
  rol,
  numSuc,
});

  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const doRefresh = () => setRefreshTick((x) => x + 1);

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        setLoading(true);

        // ✅ Validación local para no llamar si faltan datos
        if (!token || !deviceId || !codOfi) {
          setRows([]);
          setError("Faltan datos de sesión: token/deviceId/codOfi");
          return;
        }

        const qs =
          `?token=${encodeURIComponent(token)}` +
          `&deviceId=${encodeURIComponent(deviceId)}` +
          `&codOfi=${encodeURIComponent(codOfi)}` +
          `&rol=${encodeURIComponent(rol)}` +
          `&numSuc=${encodeURIComponent(numSuc)}`;

        const res = await fetch(API + qs);
        const json = await res.json();

        // ✅ Si el guard bloquea, devuelve array con código
        if (Array.isArray(json) && json.length === 1 && typeof json[0] === "string") {
          const code = json[0];
          if (code === "FALTAN_DATOS") {
            setRows([]);
            setError("Sesión inválida: FALTAN_DATOS (token/deviceId/codOfi)");
            return;
          }
          if (code === "SESSION_REPLACED") {
            setRows([]);
            setError("Sesión reemplazada: vuelve a iniciar sesión.");
            return;
          }
          if (code === "ERROR_QUERY") {
            setRows([]);
            setError("Error SQL en el servidor (ERROR_QUERY).");
            return;
          }
        }

        if (!Array.isArray(json)) {
          setRows([]);
          setError("Respuesta inválida del servidor (no es un array).");
          return;
        }

        const data = json.map((x, idx) => ({
          key: `${x.codCredi ?? "cred"}-${idx}`,
          ...x,
          saldoTotal: toNum(x.saldoTotal),
          moraTotal: toNum(x.moraTotal),
          vencidoTotal: toNum(x.vencidoTotal),
          cuota: toNum(x.cuota),
        }));

        setRows(data);
      } catch (e) {
        setRows([]);
        setError("No se pudo cargar la lista de saldos.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, deviceId, codOfi, rol, numSuc, refreshTick]);

  const totals = useMemo(() => {
    const saldo = rows.reduce((a, r) => a + toNum(r.saldoTotal), 0);
    const mora = rows.reduce((a, r) => a + toNum(r.moraTotal), 0);
    const vencido = rows.reduce((a, r) => a + toNum(r.vencidoTotal), 0);
    return { saldo, mora, vencido, cant: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const nom = String(r.nomCli ?? "").toLowerCase();
      const cred = String(r.codCredi ?? "").toLowerCase();
      const tel = String(r.telefono ?? "").toLowerCase();
      const cli = String(r.codCli ?? "").toLowerCase();
      return nom.includes(s) || cred.includes(s) || tel.includes(s) || cli.includes(s);
    });
  }, [rows, q]);

  const renderItem = ({ item }) => <BalanceCard item={item} />;

  return (
    <View style={styles.safe}>
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={styles.title}>
                Saldos
              </Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                Oficial: {codOfi || "(vacío)"} • Créditos: {totals.cant}
              </Text>
            </View>

            {loading ? <ActivityIndicator /> : <IconButton icon="refresh" onPress={doRefresh} />}
          </View>

          <Divider style={{ marginVertical: 10 }} />

          <View style={styles.kpiGrid}>
            <KpiBox title="Saldo total" value={money(totals.saldo)} icon="wallet-outline" />
            <KpiBox title="Mora total" value={money(totals.mora)} icon="alert-circle-outline" />
            <KpiBox title="Vencido" value={money(totals.vencido)} icon="calendar-alert" />
            <KpiBox title="Mostrando" value={`${filtered.length}`} icon="format-list-bulleted" />
          </View>

          <TextInput
            label="Buscar (cliente, crédito, cédula, teléfono)"
            value={q}
            onChangeText={setQ}
            mode="outlined"
            dense
            style={styles.search}
            outlineStyle={{ borderRadius: RADIUS.md }}
            left={<TextInput.Icon icon="magnify" />}
            right={q ? <TextInput.Icon icon="close" onPress={() => setQ("")} /> : null}
          />

          {!!error && <HelperText type="error">{error}</HelperText>}
        </Card.Content>
      </Card>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={doRefresh}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews
        ListEmptyComponent={
          !loading && !error ? (
            <Card style={styles.emptyCard}>
              <Card.Content>
                <Text variant="titleMedium" style={{ fontWeight: "900", color: COLORS.text }}>
                  Sin datos
                </Text>
                <Text variant="bodySmall" style={{ color: COLORS.muted, marginTop: 4 }}>
                  Si estás seguro que hay saldos, revisa que token/deviceId/codOfi sean correctos.
                </Text>
                <Button mode="contained" style={{ marginTop: 12, borderRadius: RADIUS.md }} onPress={doRefresh}>
                  Recargar
                </Button>
              </Card.Content>
            </Card>
          ) : null
        }
      />
    </View>
  );
}

/* UI */
function KpiBox({ title, value, icon }) {
  return (
    <View style={styles.kpiBox}>
      <View style={styles.kpiTop}>
        <IconButton icon={icon} size={18} style={{ margin: 0 }} />
        <Text variant="bodySmall" style={{ color: COLORS.muted }}>
          {title}
        </Text>
      </View>
      <Text variant="titleMedium" numberOfLines={1} style={styles.kpiValue}>
        {value}
      </Text>
    </View>
  );
}

function BalanceCard({ item }) {
  const mora = toNum(item.moraTotal);
  const vencido = toNum(item.vencidoTotal);

  const barStyle =
    mora > 0
      ? { backgroundColor: COLORS.danger }
      : vencido > 0
      ? { backgroundColor: COLORS.warning }
      : { backgroundColor: "transparent" };

  return (
    <Card style={styles.card}>
      <View style={styles.cardClip}>
        <View style={styles.cardRow}>
          <View style={[styles.sideBar, barStyle]} />
          <Card.Content style={styles.cardContent}>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" numberOfLines={1} style={styles.name}>
                {item.nomCli}
              </Text>
              <Text variant="bodySmall" style={styles.muted}>
                Crédito: {item.codCredi} • Tel: {item.telefono}
              </Text>
              <Text variant="bodySmall" style={styles.muted}>
                Pago: {item.nomdia} {item.fecha} • Cuota: {money(item.cuota)}
              </Text>
              {mora > 0 ? (
                <Text variant="bodySmall" style={{ color: COLORS.danger, fontWeight: "900", marginTop: 6 }}>
                  Mora: {money(mora)}
                </Text>
              ) : null}
            </View>

            <View style={{ alignItems: "flex-end", justifyContent: "center" }}>
              <Text style={styles.amount}>{money(item.saldoTotal)}</Text>
              <Text style={styles.viewMore}>Ver →</Text>
            </View>
          </Card.Content>
        </View>
      </View>
    </Card>
  );
}

/* Styles */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  headerCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },

  title: { fontWeight: "900", color: COLORS.text },
  subtitle: { marginTop: 2, color: COLORS.muted },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpiBox: {
    width: "48%",
    padding: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  kpiTop: { flexDirection: "row", alignItems: "center" },
  kpiValue: { color: COLORS.text, fontWeight: "900" },

  search: { marginTop: 6, backgroundColor: COLORS.card },

  listContainer: { paddingHorizontal: SPACING.lg, paddingBottom: 40, paddingTop: SPACING.lg },

  card: {
    marginBottom: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  cardClip: { borderRadius: RADIUS.md, overflow: "hidden" },
  cardRow: { flexDirection: "row" },
  sideBar: { width: 6 },

  cardContent: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 12 },

  name: { fontWeight: "900", color: COLORS.text },
  muted: { color: COLORS.muted, marginTop: 2 },

  amount: { fontWeight: "900", color: COLORS.primary },
  viewMore: { color: COLORS.muted, marginTop: 4, fontSize: 12 },

  emptyCard: {
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
});