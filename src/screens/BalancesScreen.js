import React, { useEffect, useMemo, useState } from "react";
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

import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const API = "https://www.nicaraguahosting.com/apptest/listar_saldos.php"; // 👈 ajusta si tu archivo se llama distinto

const money = (n) =>
  new Intl.NumberFormat("es-NI", { style: "currency", currency: "NIO" }).format(Number(n || 0));

const toNum = (v) => Number(v || 0);

export default function SaldosListScreen({ route, navigation }) {
  const rol = String(route?.params?.rol ?? "");
  const numSuc = String(route?.params?.numSuc ?? "");
  const codOfi = String(route?.params?.codOfi ?? "");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  // 🔎 buscador
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        setLoading(true);

        const qs =
          `?codOfi=${encodeURIComponent(codOfi)}` +
          `&rol=${encodeURIComponent(rol)}` +
          `&numSuc=${encodeURIComponent(numSuc)}`;

        const res = await fetch(API + qs);
        const json = await res.json();

        if (!Array.isArray(json)) {
          setRows([]);
          setError("Respuesta inválida del servidor");
          return;
        }

        // Normaliza números por si vienen como string
        const data = json.map((x, idx) => ({
          key: `${x.codCredi ?? "cred"}-${idx}`,
          ...x,
          saldoTotal: toNum(x.saldoTotal),
          moraTotal: toNum(x.moraTotal),
          vencidoTotal: toNum(x.vencidoTotal),
          cuota: toNum(x.cuota),
          pagosHoy: toNum(x.pagosHoy),
        }));

        setRows(data);
      } catch (e) {
        setRows([]);
        setError("No se pudo cargar la lista de saldos");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [codOfi, rol, numSuc, refreshTick]);

  const doRefresh = () => setRefreshTick((x) => x + 1);

  // Totales (sobre todo el dataset, no solo filtrado)
  const totals = useMemo(() => {
    const saldo = rows.reduce((a, r) => a + toNum(r.saldoTotal), 0);
    const mora = rows.reduce((a, r) => a + toNum(r.moraTotal), 0);
    const vencido = rows.reduce((a, r) => a + toNum(r.vencidoTotal), 0);
    const cant = rows.length;
    return { saldo, mora, vencido, cant };
  }, [rows]);

  // Filtrado por búsqueda
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

  const clearSearch = () => setQ("");

  const renderItem = ({ item }) => (
    <BalanceCard
      item={item}
      onPress={() => {
        // Si luego quieres detalle:
        // navigation.navigate("SaldoDetalle", { ...route.params, item })
      }}
    />
  );

  return (
    <View style={styles.safe}>
      {/* Header */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={styles.title}>
                Saldos
              </Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                Oficial: {codOfi} • Créditos: {totals.cant}
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator />
            ) : (
              <IconButton icon="refresh" onPress={doRefresh} />
            )}
          </View>

          <Divider style={{ marginVertical: 10 }} />

          {/* KPIs */}
          <View style={styles.kpiGrid}>
            <KpiBox title="Saldo total" value={money(totals.saldo)} icon="wallet-outline" />
            <KpiBox title="Mora total" value={money(totals.mora)} icon="alert-circle-outline" />
            <KpiBox title="Vencido" value={money(totals.vencido)} icon="calendar-alert" />
            <KpiBox title="Mostrando" value={`${filtered.length}`} icon="format-list-bulleted" />
          </View>

          {/* 🔎 Buscador */}
          <TextInput
            label="Buscar (cliente, crédito, cédula, teléfono)"
            value={q}
            onChangeText={setQ}
            mode="outlined"
            dense
            style={styles.search}
            outlineStyle={{ borderRadius: RADIUS.md }}
            left={<TextInput.Icon icon="magnify" />}
            right={
              q ? <TextInput.Icon icon="close" onPress={clearSearch} /> : null
            }
            returnKeyType="search"
          />

          {!!error && <HelperText type="error">{error}</HelperText>}
        </Card.Content>
      </Card>

      {/* Lista */}
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
                  Sin resultados
                </Text>
                <Text variant="bodySmall" style={{ color: COLORS.muted, marginTop: 4 }}>
                  No hay créditos que coincidan con la búsqueda.
                </Text>
                <View style={{ flexDirection: "row", marginTop: 12 }}>
                  <Button mode="contained" onPress={doRefresh} style={{ borderRadius: RADIUS.md }}>
                    Recargar
                  </Button>
                  {q ? (
                    <Button onPress={clearSearch} style={{ marginLeft: 10 }}>
                      Limpiar
                    </Button>
                  ) : null}
                </View>
              </Card.Content>
            </Card>
          ) : null
        }
      />
    </View>
  );
}

/* ---------- UI Pieces ---------- */

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

function BalanceCard({ item, onPress }) {
  const mora = toNum(item.moraTotal);
  const vencido = toNum(item.vencidoTotal);

  // ✅ barra lateral: rojo si mora>0, ámbar si vencido>0, si no -> transparente
  const barStyle =
    mora > 0
      ? { backgroundColor: COLORS.danger }
      : vencido > 0
      ? { backgroundColor: COLORS.warning }
      : { backgroundColor: "transparent" };

  return (
    <Card style={styles.card} onPress={onPress}>
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

            <View style={styles.tagRow}>
              {mora > 0 ? (
                <Text style={[styles.tag, styles.tagDanger]}>Mora {money(mora)}</Text>
              ) : null}
              {vencido > 0 ? (
                <Text style={[styles.tag, styles.tagWarn]}>Vencido {money(vencido)}</Text>
              ) : null}
            </View>
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

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

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

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
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

  search: {
    marginTop: 6,
    backgroundColor: COLORS.card,
  },

  listContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 40,
    paddingTop: SPACING.lg,
  },

  card: {
    marginBottom: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },

  cardRow: {
    flexDirection: "row",
  },

  sideBar: {
    width: 6,
  },

  cardContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },

  name: { fontWeight: "900", color: COLORS.text },
  muted: { color: COLORS.muted, marginTop: 2 },

  amount: { fontWeight: "900", color: COLORS.primary },
  viewMore: { color: COLORS.muted, marginTop: 4, fontSize: 12 },

  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    marginRight: 8,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "800",
  },
  tagDanger: {
    backgroundColor: "#FEF2F2",
    color: COLORS.danger,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  tagWarn: {
    backgroundColor: "#FFFBEB",
    color: COLORS.warning,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },

  emptyCard: {
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
});