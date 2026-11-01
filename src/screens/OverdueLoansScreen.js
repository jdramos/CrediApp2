import React, { useCallback, useContext, useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Chip, Button, TextInput, ActivityIndicator } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getWorklist } from "../api/collectionsApi";
import { buildReminderMessage, callPhone, openWhatsApp, phoneOf } from "../utils/contact";
import { money } from "../utils/format";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const PAGE = 30;

// Tramos de antigüedad: mismos del reporte de cartera.
const BUCKETS = [
  { key: "all", label: "Todos", min: 1, max: Infinity },
  { key: "1-15", label: "1-15 días", min: 1, max: 15 },
  { key: "16-30", label: "16-30", min: 16, max: 30 },
  { key: "31-60", label: "31-60", min: 31, max: 60 },
  { key: "61-90", label: "61-90", min: 61, max: 90 },
  { key: "90+", label: "Más de 90", min: 91, max: Infinity },
];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm },
  heroTitle: { color: COLORS.onGradient, fontWeight: "800", flex: 1 },
  heroSub: { color: COLORS.onGradient, opacity: 0.9, fontSize: 12 },
  filters: { paddingHorizontal: SPACING.lg, marginTop: SPACING.sm, gap: SPACING.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs },
  list: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 2,
    ...SHADOW.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACING.sm },
  name: { fontWeight: "700", color: COLORS.text, flex: 1 },
  muted: { color: COLORS.muted, fontSize: 12 },
  amount: { color: COLORS.danger, fontWeight: "800" },
  actions: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.xs },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  error: { textAlign: "center", color: COLORS.danger, marginTop: SPACING.lg, paddingHorizontal: SPACING.xl },
});

const dayColor = (d) => (d > 90 ? COLORS.danger : d > 30 ? COLORS.warning : COLORS.muted);

// Créditos en mora de la empresa (o de una sucursal / tramo de antigüedad), del
// más atrasado al menos: a quién gestionar y con qué cobrador. Viene de Finanzas >
// Cartera al tocar una sucursal o un tramo. Permiso cobranza.ver (el mismo de la
// bandeja de cobranza de la plataforma web). Se puede llamar o escribir al cliente.
export default function OverdueLoansScreen() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const { session } = useContext(SessionContext);
  const [bucket, setBucket] = useState(params?.bucket || "all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("days"); // days | amount
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getWorklist(session.token, { branch_id: params?.branchId, min_days: 1 });
      setRows(res?.data || []);
    } catch (e) {
      setRows([]);
      setError(e?.message || "No se pudo cargar la mora. Revisá tu conexión.");
    } finally {
      setLoading(false);
    }
  }, [session.token, params?.branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setShown(PAGE), [bucket, search, sort]);

  const range = BUCKETS.find((b) => b.key === bucket) || BUCKETS[0];
  const q = search.trim().toLowerCase();
  const filtered = rows
    .filter((r) => r.days_overdue >= range.min && r.days_overdue <= range.max)
    .filter((r) => !q || [r.customer_name, r.credit_code, r.customer_identification, r.collector_name].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => (sort === "amount" ? Number(b.overdue_amount) - Number(a.overdue_amount) : b.days_overdue - a.days_overdue));

  const totalOverdue = filtered.reduce((s, r) => s + Number(r.overdue_amount || 0), 0);
  const totalBalance = filtered.reduce((s, r) => s + Number(r.current_balance || 0), 0);
  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name;

  const renderItem = ({ item: r }) => {
    const phone = phoneOf(r);
    const noAction = !r.last_action_date;
    return (
      <View style={styles.card}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>{r.customer_name || "Cliente"}</Text>
          <Chip compact style={{ backgroundColor: COLORS.bg }} textStyle={{ color: dayColor(r.days_overdue), fontWeight: "800", fontSize: 11 }}>
            {`${r.days_overdue} días`}
          </Chip>
        </View>
        <Text style={styles.muted}>
          Crédito #{r.credit_code || r.loan_id} · {r.branch_name}
        </Text>
        <Text style={styles.muted}>Cobrador: {r.collector_name || "sin asignar"}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
          <Text style={styles.muted}>
            {r.overdue_installments} cuota{Number(r.overdue_installments) === 1 ? "" : "s"} vencida{Number(r.overdue_installments) === 1 ? "" : "s"}
          </Text>
          <Text style={styles.amount}>{money(r.overdue_amount)}</Text>
        </View>
        <Text style={styles.muted}>Saldo del crédito: {money(r.current_balance)}</Text>
        <Text style={[styles.muted, noAction && { color: COLORS.danger, fontWeight: "700" }]}>
          {noAction ? "Sin gestión registrada" : `Última gestión: ${String(r.last_action_date).slice(0, 10)}`}
          {r.promise_status === "PENDING" && r.promised_date ? ` · Promesa ${money(r.promised_amount)} para ${String(r.promised_date).slice(0, 10)}` : ""}
        </Text>
        <View style={styles.actions}>
          <Button compact mode="outlined" icon="phone-outline" disabled={!phone} onPress={() => callPhone(phone)} style={{ flex: 1, borderRadius: RADIUS.md }} labelStyle={{ fontSize: 11 }}>
            Llamar
          </Button>
          <Button
            compact
            mode="outlined"
            icon="whatsapp"
            disabled={!phone}
            onPress={() =>
              openWhatsApp(
                phone,
                buildReminderMessage({
                  tenantName,
                  customerName: r.customer_name,
                  loanLabel: r.credit_code || r.loan_id,
                  overdueInstallments: r.overdue_installments,
                  overdueAmount: r.overdue_amount,
                  daysOverdue: r.days_overdue,
                }),
                { kind: "REMINDER", loanId: r.loan_id },
              )
            }
            style={{ flex: 1, borderRadius: RADIUS.md }}
            labelStyle={{ fontSize: 11 }}
          >
            WhatsApp
          </Button>
          <Button
            compact
            mode="outlined"
            icon="file-document-outline"
            onPress={() => navigation.navigate("Pagos", { screen: "AccountStatement", params: { loanId: r.loan_id } })}
            style={{ flex: 1, borderRadius: RADIUS.md }}
            labelStyle={{ fontSize: 11 }}
          >
            Estado
          </Button>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.danger} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle} numberOfLines={1}>
            Créditos en mora{params?.branchName ? ` · ${params.branchName}` : ""}
          </Text>
        </View>
        {!loading && !error && (
          <Text style={styles.heroSub}>
            {filtered.length} crédito{filtered.length === 1 ? "" : "s"} · cuotas vencidas {money(totalOverdue)} · capital de esos créditos {money(totalBalance)}
          </Text>
        )}
      </LinearGradient>

      <View style={styles.filters}>
        <View style={styles.chips}>
          {BUCKETS.map((b) => (
            <Chip key={b.key} compact selected={bucket === b.key} showSelectedCheck={false} onPress={() => setBucket(b.key)} style={{ backgroundColor: bucket === b.key ? COLORS.primarySoft : COLORS.card }}>
              {b.label}
            </Chip>
          ))}
        </View>
        <TextInput
          mode="outlined"
          dense
          placeholder="Buscar cliente, cédula, crédito o cobrador"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          style={{ backgroundColor: COLORS.card }}
          outlineStyle={{ borderRadius: RADIUS.md }}
          left={<TextInput.Icon icon="magnify" />}
        />
        <View style={styles.chips}>
          {[["days", "Más días de atraso"], ["amount", "Mayor monto vencido"]].map(([key, label]) => (
            <Chip key={key} compact selected={sort === key} showSelectedCheck={false} onPress={() => setSort(key)} style={{ backgroundColor: sort === key ? COLORS.primarySoft : COLORS.card }}>
              {label}
            </Chip>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={filtered.slice(0, shown)}
          keyExtractor={(r) => String(r.loan_id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={!!error && <Text style={styles.error}>{error}</Text>}
          ListEmptyComponent={!error && <Text style={styles.empty}>No hay créditos en mora con estos filtros.</Text>}
          ListFooterComponent={
            filtered.length > shown ? (
              <Button mode="outlined" onPress={() => setShown(shown + PAGE)} style={{ borderRadius: RADIUS.md }}>
                {`Ver más (${filtered.length - shown} restantes)`}
              </Button>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
