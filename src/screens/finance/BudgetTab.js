import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Chip, Button } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../../auth/SessionContext";
import { getBudgets, getBudgetTracking, getBudgetAlerts } from "../../api/financeApi";
import { useTenantLogo } from "../../hooks/useTenantLogo";
import ShareCardHeader from "../../components/ShareCardHeader";
import { shareImage } from "../../utils/shareImage";
import { money } from "../../utils/format";
import { COLORS } from "../../theme/colors";
import { RADIUS, SPACING } from "../../theme/layout";
import { fin, MonthNav, periodLabel, currentPeriod, Row, Loading, ErrorBox, pct } from "./ui";

const STATUS = {
  OK: { label: "En rango", color: COLORS.success },
  WARNING: { label: "Atención", color: COLORS.warning },
  ALERT: { label: "Alerta", color: COLORS.danger },
};

// Barra de ejecución (real / presupuesto): llena hasta 100 %; lo que se pasa se
// ve entero de color de alerta.
function Bar({ percent, color }) {
  const v = Math.max(0, Number(percent) || 0);
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.bg, marginVertical: 3 }}>
      <View style={{ width: `${Math.min(100, Math.max(v, 1))}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

const sumBy = (rows, type, key) => rows.filter((r) => r.account_type === type).reduce((s, r) => s + Number(r[key] || 0), 0);

// Presupuesto contra lo ejecutado (permiso presupuesto.ver, módulo de presupuesto de
// la web): ingresos y gastos del mes y del año contra lo presupuestado, cada cuenta
// con su estado, la colocación por sucursal contra su meta y las alertas abiertas.
export default function BudgetTab() {
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null); // { budget, accounts, placement, summary, alerts }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const year = Number(period.slice(0, 4));
        const month = Number(period.slice(5, 7));
        const list = (await getBudgets(session.token))?.data || [];
        // El presupuesto del año del mes elegido (si hay varios, el activo).
        const budget = list.filter((b) => Number(b.year_no) === year).sort((a, b) => (a.status === "ACTIVE" ? -1 : 1) - (b.status === "ACTIVE" ? -1 : 1))[0];
        if (!budget) {
          setData({ none: true, year });
          return;
        }
        const [tracking, alerts] = await Promise.all([
          getBudgetTracking(session.token, budget.id, month),
          getBudgetAlerts(session.token).catch(() => null),
        ]);
        setData({ ...(tracking?.data || {}), alerts: (alerts?.data || []).filter((a) => a.status === "OPEN" && a.budget_id === budget.id) });
      } catch (e) {
        setData(null);
        setError(
          e?.status === 403
            ? "Tu empresa no tiene activo el módulo de presupuesto o tu usuario no tiene acceso."
            : e?.message || "No se pudo cargar el presupuesto. Revisá tu conexión.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, period],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onShare = async () => {
    try {
      setSharing(true);
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Presupuesto contra ejecutado");
    } catch (e) {
      setError(e?.message || "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const accounts = data?.accounts || [];
  const income = { b: sumBy(accounts, "INGRESO", "budgeted_month"), a: sumBy(accounts, "INGRESO", "actual_month"), by: sumBy(accounts, "INGRESO", "budgeted_ytd"), ay: sumBy(accounts, "INGRESO", "actual_ytd") };
  const expense = { b: sumBy(accounts, "GASTO", "budgeted_month"), a: sumBy(accounts, "GASTO", "actual_month"), by: sumBy(accounts, "GASTO", "budgeted_ytd"), ay: sumBy(accounts, "GASTO", "actual_ytd") };
  const exec = (a, b) => (b > 0 ? (a / b) * 100 : 0);

  const filtered = accounts.filter((a) => {
    if (filter === "income") return a.account_type === "INGRESO";
    if (filter === "expense") return a.account_type === "GASTO";
    if (filter === "alert") return a.status === "ALERT" || a.status === "WARNING";
    return true;
  });

  return (
    <ScrollView
      contentContainerStyle={fin.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <MonthNav period={period} onChange={setPeriod} disabled={loading} />

      {loading && !data && <Loading />}
      {!!error && <ErrorBox message={error} onRetry={() => load()} />}

      {data?.none && (
        <View style={fin.card}>
          <Text style={fin.muted}>No hay un presupuesto cargado para {data.year}.</Text>
        </View>
      )}

      {data && !data.none && (
        <>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={{ gap: SPACING.md, backgroundColor: COLORS.bg }}>
            <ShareCardHeader
              logoUrl={logoUrl}
              tenantName={session?.tenant?.commercial_name || session?.tenant?.legal_name}
              title="Presupuesto contra ejecutado"
              lines={[`${periodLabel(period)} · presupuesto ${data.budget?.name || ""}`, `${data.summary?.accounts_in_alert ?? 0} cuenta(s) en alerta`]}
            />

            <View style={fin.card}>
              <Text style={fin.title}>Ingresos</Text>
              <Row label="Del mes" value={`${money(income.a)} de ${money(income.b)}`} sub={<Text style={fin.muted}>{pct(exec(income.a, income.b), 1)} del presupuesto</Text>} />
              <Bar percent={exec(income.a, income.b)} color={exec(income.a, income.b) >= 80 ? COLORS.success : COLORS.warning} />
              <Row label="Del año" value={`${money(income.ay)} de ${money(income.by)}`} sub={<Text style={fin.muted}>{pct(exec(income.ay, income.by), 1)} del presupuesto</Text>} />
              <Bar percent={exec(income.ay, income.by)} color={exec(income.ay, income.by) >= 80 ? COLORS.success : COLORS.warning} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Gastos</Text>
              <Row label="Del mes" value={`${money(expense.a)} de ${money(expense.b)}`} sub={<Text style={fin.muted}>{pct(exec(expense.a, expense.b), 1)} del presupuesto</Text>} />
              <Bar percent={exec(expense.a, expense.b)} color={exec(expense.a, expense.b) > 100 ? COLORS.danger : exec(expense.a, expense.b) >= 90 ? COLORS.warning : COLORS.primary} />
              <Row label="Del año" value={`${money(expense.ay)} de ${money(expense.by)}`} sub={<Text style={fin.muted}>{pct(exec(expense.ay, expense.by), 1)} del presupuesto</Text>} />
              <Bar percent={exec(expense.ay, expense.by)} color={exec(expense.ay, expense.by) > 100 ? COLORS.danger : exec(expense.ay, expense.by) >= 90 ? COLORS.warning : COLORS.primary} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Resultado (ingresos − gastos)</Text>
              <Row label="Del mes · real" value={money(income.a - expense.a)} color={income.a - expense.a < 0 ? COLORS.danger : COLORS.success} />
              <Row label="Del mes · presupuestado" value={money(income.b - expense.b)} />
              <Row label="Del año · real" value={money(income.ay - expense.ay)} color={income.ay - expense.ay < 0 ? COLORS.danger : COLORS.success} />
              <Row label="Del año · presupuestado" value={money(income.by - expense.by)} />
            </View>

            {(data.placement || []).length > 0 && (
              <View style={fin.card}>
                <Text style={fin.title}>Colocación por sucursal</Text>
                {data.placement.map((p) => {
                  const st = STATUS[p.status] || STATUS.OK;
                  return (
                    <View key={p.branch_id}>
                      <Row label={p.branch_name} value={`${money(p.actual_month)} de ${money(p.target_month)}`} sub={<Text style={[fin.muted, { color: st.color }]}>{pct(p.target_month > 0 ? (p.actual_month / p.target_month) * 100 : 0, 1)} de la meta del mes · {st.label}</Text>} />
                      <Bar percent={p.target_month > 0 ? (p.actual_month / p.target_month) * 100 : 0} color={st.color} />
                    </View>
                  );
                })}
              </View>
            )}

            {(data.alerts || []).length > 0 && (
              <View style={fin.card}>
                <Text style={fin.title}>Alertas abiertas ({data.alerts.length})</Text>
                {data.alerts.slice(0, 6).map((a) => (
                  <Text key={a.id} style={{ color: COLORS.text, fontSize: 12, marginVertical: 2 }}>
                    • {a.description}
                  </Text>
                ))}
              </View>
            )}

            <View style={fin.card}>
              <Text style={fin.title}>Por cuenta</Text>
              <View style={fin.chips}>
                {[["all", "Todas"], ["income", "Ingresos"], ["expense", "Gastos"], ["alert", "Con alerta"]].map(([key, label]) => (
                  <Chip key={key} compact selected={filter === key} showSelectedCheck={false} onPress={() => setFilter(key)} style={{ backgroundColor: filter === key ? COLORS.primarySoft : COLORS.card }}>
                    {label}
                  </Chip>
                ))}
              </View>
              {filtered.length === 0 && <Text style={fin.muted}>No hay cuentas con este filtro.</Text>}
              {filtered.map((a) => {
                const st = STATUS[a.status] || STATUS.OK;
                const percent = exec(a.actual_month, a.budgeted_month);
                const expanded = open === a.account_id;
                return (
                  <Pressable key={a.account_id} onPress={() => setOpen(expanded ? null : a.account_id)} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm }}>
                      <Text style={[fin.rowLabel, { fontSize: 13, fontWeight: "700" }]}>{a.account_name}</Text>
                      <Text style={{ color: st.color, fontSize: 11, fontWeight: "700" }}>{st.label}</Text>
                    </View>
                    <Text style={fin.muted}>
                      {a.muc_code} · {a.account_type === "INGRESO" ? "Ingreso" : "Gasto"}
                    </Text>
                    <Bar percent={percent} color={a.account_type === "GASTO" ? (percent > 100 ? COLORS.danger : percent >= 90 ? COLORS.warning : COLORS.primary) : percent >= 80 ? COLORS.success : COLORS.warning} />
                    <Text style={{ color: COLORS.text, fontSize: 12 }}>
                      Mes: {money(a.actual_month)} de {money(a.budgeted_month)} ({pct(percent, 1)})
                    </Text>
                    {expanded && (
                      <Text style={fin.muted}>
                        Año: {money(a.actual_ytd)} de {money(a.budgeted_ytd)} ({pct(exec(a.actual_ytd, a.budgeted_ytd), 1)}) · diferencia del año {money(a.variance_ytd)}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ViewShot>

          <Button mode="outlined" icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
            Compartir como imagen
          </Button>
        </>
      )}
    </ScrollView>
  );
}
