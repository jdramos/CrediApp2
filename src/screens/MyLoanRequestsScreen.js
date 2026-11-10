import React, { useCallback, useContext, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Card, Chip, ActivityIndicator, HelperText, IconButton, FAB } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getAccessibleBranches } from "../api/branchApi";
import { getAllLoans, getLoans } from "../api/loanApi";
import { money } from "../utils/format";
import { periodRange } from "../utils/date";
import { loanStage } from "../utils/loanStage";
import { COLORS } from "../theme/colors";
import CopyableId from "../components/CopyableId";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import { withCode } from "../utils/customerLabel";

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
  // Filtros en una sola línea deslizable (antes los chips se acomodaban en varias líneas y ocupaban media pantalla).
  chipsScroll: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingRight: SPACING.lg },
  searchRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 96, gap: SPACING.sm },
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
  fab: { position: "absolute", right: SPACING.lg, bottom: SPACING.lg, backgroundColor: COLORS.primary },
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
  const [showMore, setShowMore] = useState(false); // "Más filtros": quién la sometió y sucursal
  const canCreate = session?.permissions?.includes("creditos.insertar");
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
        const res = await getAllLoans(session.token, {
          status,
          search: search.trim() || undefined,
          branch_id: branchId,
          mine: mineOnly ? "1" : undefined,
          startDate: range?.from,
          endDate: range?.to,
          sortBy: "a.id",
          sortOrder: "DESC",
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
  const moreActive = !mineOnly || branchId !== undefined;

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
        <View style={styles.searchRow}>
          <TextInput
            mode="outlined"
            dense
            placeholder="Buscar por nombre o cédula"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => load()}
            autoCapitalize="none"
            style={{ backgroundColor: COLORS.card, flex: 1 }}
            outlineStyle={{ borderRadius: RADIUS.md }}
            left={<TextInput.Icon icon="magnify" />}
            right={search ? <TextInput.Icon icon="close" onPress={() => { setSearch(""); }} /> : null}
          />
          <IconButton
            icon={showMore ? "filter-variant-remove" : "filter-variant"}
            mode={moreActive ? "contained" : "outlined"}
            selected={moreActive}
            onPress={() => setShowMore((v) => !v)}
            accessibilityLabel="Más filtros"
            style={{ margin: 0 }}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {PERIODS.map((p) => (
            <Chip
              key={p.key}
              compact
              selected={period === p.key}
              showSelectedCheck={false}
              onPress={() => setPeriod(p.key)}
              style={{ backgroundColor: period === p.key ? COLORS.primarySoft : COLORS.card }}
            >
              {p.label}
            </Chip>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {STATUS_FILTERS.map((f) => (
            <Chip
              key={f.key}
              compact
              selected={status === f.key}
              showSelectedCheck={false}
              onPress={() => setStatus(f.key)}
              style={{ backgroundColor: status === f.key ? COLORS.primarySoft : COLORS.card }}
            >
              {f.label}
            </Chip>
          ))}
        </ScrollView>

        {showMore && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              <Chip
                compact
                selected={mineOnly}
                onPress={() => setMineOnly(true)}
                icon="account"
                style={{ backgroundColor: mineOnly ? COLORS.primarySoft : COLORS.card }}
              >
                Sometidas por mí
              </Chip>
              <Chip
                compact
                selected={!mineOnly}
                onPress={() => setMineOnly(false)}
                icon="account-group"
                style={{ backgroundColor: !mineOnly ? COLORS.primarySoft : COLORS.card }}
              >
                Todas mis sucursales
              </Chip>
            </ScrollView>

            {(branches.length > 1 || allAccess) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                <Chip
                  compact
                  selected={branchId === undefined}
                  onPress={() => setBranchId(undefined)}
                  style={{ backgroundColor: branchId === undefined ? COLORS.primarySoft : COLORS.card }}
                >
                  Todas las sucursales
                </Chip>
                {branches.map((b) => (
                  <Chip
                    key={b.id}
                    compact
                    selected={branchId === b.id}
                    onPress={() => setBranchId(b.id)}
                    style={{ backgroundColor: branchId === b.id ? COLORS.primarySoft : COLORS.card }}
                  >
                    {b.name}
                  </Chip>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {Object.keys(stageCounts).length > 0 && loans.length >= total && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {Object.values(stageCounts).map((s2) => (
              <Chip
                key={s2.key}
                compact
                style={{ backgroundColor: COLORS.bg }}
                textStyle={{ color: s2.color, fontWeight: "700", fontSize: 11 }}
              >
                {`${s2.count} ${s2.label}`}
              </Chip>
            ))}
          </ScrollView>
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
                  <Text style={styles.name} numberOfLines={1}>{withCode(item.customer_name, item.customer_code)}</Text>
                  <Text style={styles.amount}>{money(item.amount)}</Text>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
                  <CopyableId label="Cédula: " value={item.customer_identification} textStyle={styles.muted} />
                  <Text style={styles.muted}> · Solicitud #{item.id}</Text>
                </View>
                {!!item.created_by_name && (
                  <Text style={styles.muted}>
                    Solicitado por {item.created_by_name}{item.source ? ` · ${item.source === "MOBILE" ? "App" : "Web"}` : ""} · {item.date}
                  </Text>
                )}
                {String(item.status).toUpperCase() === "PENDING" && String(item.created_by ?? "") === String(session?.user?.id ?? "") && (
                  <Text style={[styles.muted, { color: COLORS.primary, fontWeight: "700" }]}>Pendiente de aprobación · toque para ver o modificar</Text>
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

      {canCreate && (
        <FAB
          icon="plus"
          label="Nueva solicitud"
          color={COLORS.onGradient}
          style={styles.fab}
          onPress={() => navigation.push("NewLoanRequest")}
        />
      )}
    </SafeAreaView>
  );
}
