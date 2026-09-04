import React, { useCallback, useContext, useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Card, Chip, Button, ActivityIndicator, HelperText, IconButton } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SessionContext } from "../auth/SessionContext";
import { getAccessibleBranches } from "../api/branchApi";
import { getLoans } from "../api/loanApi";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const STATUS_FILTERS = [
  { key: "", label: "Todas" },
  { key: "PENDIENTE", label: "Pendientes" },
  { key: "APROBADO", label: "Aprobadas" },
  { key: "RECHAZADO", label: "Rechazadas" },
];

const STATUS_COLOR = {
  PENDIENTE: COLORS.warning,
  PENDING: COLORS.warning,
  APROBADO: COLORS.success,
  APPROVED: COLORS.success,
  RECHAZADO: COLORS.danger,
  REJECTED: COLORS.danger,
  DISBURSED: COLORS.primary,
  CANCELLED: COLORS.muted,
  WRITTEN_OFF: COLORS.muted,
  DRAFT: COLORS.muted,
};
const STATUS_LABEL = {
  PENDIENTE: "Pendiente",
  PENDING: "Pendiente",
  APROBADO: "Aprobado",
  APPROVED: "Aprobado",
  RECHAZADO: "Rechazado",
  REJECTED: "Rechazado",
  DISBURSED: "Desembolsado",
  CANCELLED: "Cancelado",
  WRITTEN_OFF: "Castigado",
  DRAFT: "Borrador",
};

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
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  amount: { fontWeight: "800", color: COLORS.text, fontSize: 16 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl },
});

export default function MyLoanRequestsScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);

  const [branches, setBranches] = useState([]);
  const [allAccess, setAllAccess] = useState(false);
  const [branchId, setBranchId] = useState(undefined); // undefined = "Todas"

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showDate, setShowDate] = useState(null); // "start" | "end" | null

  const [mineOnly, setMineOnly] = useState(true);
  const [loans, setLoans] = useState([]);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAccessibleBranches(session.token)
      .then((res) => {
        setBranches(res?.data || []);
        setAllAccess(!!res?.all_access);
      })
      .catch(() => {});
  }, [session.token]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = {
        status,
        search: search.trim() || undefined,
        branch_id: branchId,
        mine: mineOnly ? "1" : undefined,
        startDate: startDate && endDate ? startDate : undefined,
        endDate: startDate && endDate ? endDate : undefined,
        sortBy: "a.date",
        sortOrder: "DESC",
        limit: 100,
      };
      const res = await getLoans(session.token, params);
      setLoans(res?.data || []);
      setTotal(res?.total ?? (res?.data || []).length);
    } catch (e) {
      setError(e?.message ?? "Error cargando solicitudes");
    } finally {
      setLoading(false);
    }
  }, [session.token, status, search, branchId, mineOnly, startDate, endDate]);

  const loadPendingTotal = useCallback(() => {
    getLoans(session.token, { status: "PENDIENTE", branch_id: branchId, mine: mineOnly ? "1" : undefined, limit: 1 })
      .then((res) => setPendingTotal(res?.total ?? 0))
      .catch(() => {});
  }, [session.token, branchId, mineOnly]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusEffect(useCallback(() => { loadPendingTotal(); }, [loadPendingTotal]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Mis solicitudes</Text>
      </View>
      <Text style={styles.sub}>
        {total} solicitud{total === 1 ? "" : "es"} · {pendingTotal} pendiente{pendingTotal === 1 ? "" : "s"} de aprobación
      </Text>

      <View style={styles.filtersWrap}>
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
          onSubmitEditing={load}
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

        <View style={{ flexDirection: "row", gap: SPACING.sm }}>
          <Button
            mode="outlined"
            icon="calendar"
            onPress={() => setShowDate("start")}
            style={{ borderRadius: RADIUS.md, flex: 1 }}
          >
            {startDate || "Desde"}
          </Button>
          <Button
            mode="outlined"
            icon="calendar"
            onPress={() => setShowDate("end")}
            style={{ borderRadius: RADIUS.md, flex: 1 }}
          >
            {endDate || "Hasta"}
          </Button>
          {(startDate || endDate) && (
            <IconButton icon="close-circle-outline" onPress={() => { setStartDate(null); setEndDate(null); }} />
          )}
        </View>
        {showDate && (
          <DateTimePicker
            value={new Date((showDate === "start" ? startDate : endDate) || Date.now())}
            mode="date"
            display="default"
            onChange={(_, selected) => {
              const target = showDate;
              setShowDate(null);
              if (!selected) return;
              const iso = selected.toISOString().slice(0, 10);
              if (target === "start") setStartDate(iso);
              else setEndDate(iso);
            }}
          />
        )}
      </View>

      <HelperText type="error" visible={!!error} style={{ marginHorizontal: SPACING.lg }}>{error}</HelperText>
      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {!loading && (
        <FlatList
          data={loans}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>Sin solicitudes con estos filtros.</Text>}
          renderItem={({ item }) => {
            const st = item.approval_status || item.status;
            return (
              <Card style={styles.row} onPress={() => navigation.navigate("LoanDetail", { loanId: item.id })}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.customer_name || "Cliente"}</Text>
                  <Text style={styles.amount}>{money(item.amount)}</Text>
                </View>
                <Text style={styles.muted}>Cédula: {item.customer_identification} · Crédito #{item.id}</Text>
                {!!item.created_by_name && (
                  <Text style={styles.muted}>
                    Solicitado por {item.created_by_name}{item.source ? ` · ${item.source === "MOBILE" ? "App" : "Web"}` : ""}
                  </Text>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.xs }}>
                  <Text style={styles.muted}>{item.date}</Text>
                  <Chip
                    compact
                    style={{ backgroundColor: COLORS.bg }}
                    textStyle={{ color: STATUS_COLOR[st] || COLORS.muted, fontSize: 11, fontWeight: "700" }}
                  >
                    {STATUS_LABEL[st] || st}
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
