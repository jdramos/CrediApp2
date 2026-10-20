import React, { useCallback, useContext, useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Card, Chip, ActivityIndicator, HelperText, IconButton } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getAccessibleBranches } from "../api/branchApi";
import { getLoans } from "../api/loanApi";
import { money } from "../utils/format";
import { periodRange } from "../utils/date";
import { loanStage } from "../utils/loanStage";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const STATUS_FILTERS = [
  { key: "", label: "Todas" },
  { key: "PENDIENTE", label: "Pendientes" },
  { key: "APROBADO", label: "Aprobadas" },
  { key: "RECHAZADO", label: "Rechazadas" },
];

// Por defecto se ven las solicitudes DE HOY; "Todas" quita el filtro de fecha.
const PERIODS = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "all", label: "Todas" },
];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2, paddingHorizontal: SPACING.lg },
  filtersWrap: { paddingHorizontal: SPACING.lg, marginTop: SPACING.sm, gap: SPACING.sm },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 110, gap: SPACING.sm },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.sm },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  amount: { fontWeight: "800", color: COLORS.text, fontSize: 16 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  stageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.xs, gap: SPACING.sm },
  stageDetail: { color: COLORS.muted, fontSize: 12, flex: 1 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
});

// "Mis solicitudes": las solicitudes de crédito que sometí, con su ESTADO
// ACTUAL (borrador, en aprobación n de m, aprobada, rechazada, desembolsada,
// entregada...). Por defecto salen las de hoy; se puede cambiar el período,
// filtrar por resultado de aprobación, buscar y ver las de toda la sucursal.
export default function MyLoanRequestsScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);

  const [branches, setBranches] = useState([]);
  const [allAccess, setAllAccess] = useState(false);
  const [branchId, setBranchId] = useState(undefined); // undefined = "Todas"

  const [period, setPeriod] = useState("today");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const [mineOnly, setMineOnly] = useState(true);
  const [loans, setLoans] = useState([]);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAccessibleBranches(session.token)
      .then((res) => {
        setBranches(res?.data || []);
        setAllAccess(!!res?.all_access);
      })
      .catch(() => {});
  }, [session.token]);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError("");
        const range = period === "all" ? null : periodRange(period);
        const res = await getLoans(session.token, {
          status,
          search: search.trim() || undefined,
          branch_id: branchId,
          mine: mineOnly ? "1" : undefined,
          startDate: range?.from,
          endDate: range?.to,
          sortBy: "a.id",
          sortOrder: "DESC",
          limit: 100,
        });
        setLoans(res?.data || []);
        setTotal(res?.total ?? (res?.data || []).length);
      } catch (e) {
        setError(e?.message ?? "Error cargando solicitudes");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, status, search, branchId, mineOnly, period],
  );

  const loadPendingTotal = useCallback(() => {
    getLoans(session.token, { status: "PENDIENTE", branch_id: branchId, mine: mineOnly ? "1" : undefined, limit: 1 })
      .then((res) => setPendingTotal(res?.total ?? 0))
      .catch(() => {});
  }, [session.token, branchId, mineOnly]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => { loadPendingTotal(); }, [loadPendingTotal]));

  // Resumen por estado de lo que se está viendo (ej.: "2 En aprobación").
  const stageCounts = {};
  loans.forEach((l) => {
    const st = loanStage(l);
    stageCounts[st.key] = stageCounts[st.key] || { ...st, count: 0 };
    stageCounts[st.key].count += 1;
  });

  const periodLabel = PERIODS.find((p) => p.key === period)?.label?.toLowerCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Mis solicitudes</Text>
      </View>
      <Text style={styles.sub}>
        {total} solicitud{total === 1 ? "" : "es"}{period === "all" ? "" : ` (${periodLabel})`} · {pendingTotal} pendiente
        {pendingTotal === 1 ? "" : "s"} de aprobación en total
      </Text>

      <View style={styles.filtersWrap}>
        <View style={styles.chipsRow}>
          {PERIODS.map((p) => (
            <Chip
              key={p.key}
              selected={period === p.key}
              showSelectedCheck={false}
              onPress={() => setPeriod(p.key)}
              style={{ backgroundColor: period === p.key ? COLORS.primarySoft : COLORS.card }}
            >
              {p.label}
            </Chip>
          ))}
        </View>

        <View style={styles.chipsRow}>
          <Chip
            selected={mineOnly}
            onPress={() => setMineOnly(true)}
            icon="account"
            style={{ backgroundColor: mineOnly ? COLORS.primarySoft : COLORS.card }}
          >
            Sometidas por mí
          </Chip>
          <Chip
            selected={!mineOnly}
            onPress={() => setMineOnly(false)}
            icon="account-group"
            style={{ backgroundColor: !mineOnly ? COLORS.primarySoft : COLORS.card }}
          >
            Todas mis sucursales
          </Chip>
        </View>

        <TextInput
          mode="outlined"
          placeholder="Buscar por nombre o cédula"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load()}
          autoCapitalize="none"
          style={{ backgroundColor: COLORS.card }}
          outlineStyle={{ borderRadius: RADIUS.md }}
          left={<TextInput.Icon icon="magnify" />}
          right={search ? <TextInput.Icon icon="close" onPress={() => { setSearch(""); }} /> : null}
        />

        <View style={styles.chipsRow}>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.key}
              selected={status === f.key}
              showSelectedCheck={false}
              onPress={() => setStatus(f.key)}
              style={{ backgroundColor: status === f.key ? COLORS.primarySoft : COLORS.card }}
            >
              {f.label}
            </Chip>
          ))}
        </View>

        {(branches.length > 1 || allAccess) && (
          <View style={styles.chipsRow}>
            <Chip
              selected={branchId === undefined}
              onPress={() => setBranchId(undefined)}
              style={{ backgroundColor: branchId === undefined ? COLORS.primarySoft : COLORS.card }}
            >
              Todas las sucursales
            </Chip>
            {branches.map((b) => (
              <Chip
                key={b.id}
                selected={branchId === b.id}
                onPress={() => setBranchId(b.id)}
                style={{ backgroundColor: branchId === b.id ? COLORS.primarySoft : COLORS.card }}
              >
                {b.name}
              </Chip>
            ))}
          </View>
        )}

        {Object.keys(stageCounts).length > 0 && loans.length >= total && (
          <View style={styles.chipsRow}>
            {Object.values(stageCounts).map((s) => (
              <Chip
                key={s.key}
                compact
                style={{ backgroundColor: COLORS.bg }}
                textStyle={{ color: s.color, fontWeight: "700", fontSize: 11 }}
              >
                {`${s.count} ${s.label}`}
              </Chip>
            ))}
          </View>
        )}
      </View>

      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>
      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {!loading && (
        <FlatList
          data={loans}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {period === "today" ? "Hoy no has sometido solicitudes. Tocá «Todas» para ver las anteriores." : "Sin solicitudes con estos filtros."}
            </Text>
          }
          renderItem={({ item }) => {
            const st = loanStage(item);
            return (
              <Card style={styles.row} onPress={() => navigation.navigate("LoanDetail", { loanId: item.id })}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>{item.customer_name || "Cliente"}</Text>
                  <Text style={styles.amount}>{money(item.amount)}</Text>
                </View>
                <Text style={styles.muted}>Cédula: {item.customer_identification} · Solicitud #{item.id}</Text>
                {!!item.created_by_name && (
                  <Text style={styles.muted}>
                    Solicitado por {item.created_by_name}{item.source ? ` · ${item.source === "MOBILE" ? "App" : "Web"}` : ""} · {item.date}
                  </Text>
                )}
                <View style={styles.stageRow}>
                  <Text style={styles.stageDetail} numberOfLines={2}>{st.detail}</Text>
                  <Chip
                    compact
                    style={{ backgroundColor: COLORS.bg }}
                    textStyle={{ color: st.color, fontSize: 11, fontWeight: "700" }}
                  >
                    {st.label}
                  </Chip>
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
