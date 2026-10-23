import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { Text, Chip, Button } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../../auth/SessionContext";
import { getManagementDashboard } from "../../api/financeApi";
import { getAccessibleBranches } from "../../api/branchApi";
import { useTenantLogo } from "../../hooks/useTenantLogo";
import ShareCardHeader from "../../components/ShareCardHeader";
import { shareImage } from "../../utils/shareImage";
import { money } from "../../utils/format";
import { todayISO } from "../../utils/date";
import { COLORS } from "../../theme/colors";
import { RADIUS, SPACING } from "../../theme/layout";
import { fin, MonthNav, periodLabel, currentPeriod, Delta, Row, Kpi, Loading, ErrorBox, pct, MiniBars, monthShort } from "./ui";

// Primer y último día del mes (el último, tope en hoy si el mes está en curso).
function monthRange(period) {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const end = `${period}-${String(last).padStart(2, "0")}`;
  const today = todayISO();
  return { from: `${period}-01`, to: end > today ? today : end };
}

function Progress({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 100 ? COLORS.success : v >= 70 ? COLORS.primary : v >= 40 ? COLORS.warning : COLORS.danger;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: COLORS.bg, marginVertical: 4 }}>
      <View style={{ width: `${Math.max(v, 1)}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

// Gestión del mes (permiso balances.ver): cómo va el mes y contra el mes anterior
// en colocación (con su meta), recuperación y eficiencia de cobro, clientes y
// saneados, con la tendencia de 12 meses y los mejores promotores y cobradores.
// Es el mismo tablero gerencial de la plataforma web.
export default function ManagementTab() {
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(undefined);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    getAccessibleBranches(session.token).then((r) => setBranches(r?.data || [])).catch(() => {});
  }, [session.token]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const { from, to } = monthRange(period);
        const res = await getManagementDashboard(session.token, { date_from: from, date_to: to, branch_id: branchId });
        setData({ ...(res?.data || {}), range: { from, to } });
      } catch (e) {
        setData(null);
        setError(e?.message || "No se pudo cargar la gestión del mes. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, period, branchId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onShare = async () => {
    try {
      setSharing(true);
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Gestion del mes");
    } catch (e) {
      setError(e?.message || "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const cur = data?.current;
  const prev = data?.previous;
  const goal = data?.placement_goal;
  const trend = data?.trend || [];
  const branchName = branchId ? branches.find((b) => b.id === branchId)?.name : "Todas mis sucursales";
  const vsLabel = data?.comparison?.label || "mes anterior";

  return (
    <ScrollView
      contentContainerStyle={fin.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <MonthNav period={period} onChange={setPeriod} disabled={loading} />

      {branches.length > 1 && (
        <View style={fin.chips}>
          <Chip selected={branchId === undefined} showSelectedCheck={false} onPress={() => setBranchId(undefined)} style={{ backgroundColor: branchId === undefined ? COLORS.primarySoft : COLORS.card }}>
            Todas
          </Chip>
          {branches.map((b) => (
            <Chip key={b.id} selected={branchId === b.id} showSelectedCheck={false} onPress={() => setBranchId(b.id)} style={{ backgroundColor: branchId === b.id ? COLORS.primarySoft : COLORS.card }}>
              {b.name}
            </Chip>
          ))}
        </View>
      )}

      {loading && !data && <Loading />}
      {!!error && <ErrorBox message={error} onRetry={() => load()} />}

      {cur && (
        <>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={{ gap: SPACING.md, backgroundColor: COLORS.bg }}>
            <ShareCardHeader
              logoUrl={logoUrl}
              tenantName={session?.tenant?.commercial_name || session?.tenant?.legal_name}
              title="Gestión del mes"
              lines={[`${periodLabel(period)} · del ${data.range.from} al ${data.range.to}`, `${branchName} · comparado con el ${vsLabel}`]}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
              <Kpi label="Colocado" value={money(cur.disbursements.amount)} note={`${cur.disbursements.loans} créditos`} />
              <Kpi label="Cobrado" value={money(cur.collections.total)} note={`${cur.collections.payments} pagos`} color={COLORS.success} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Colocación</Text>
              {goal ? (
                <>
                  <View style={fin.row}>
                    <Text style={fin.rowLabel}>Meta del período</Text>
                    <Text style={fin.rowValue}>{money(goal.target_amount)}</Text>
                  </View>
                  <Progress value={goal.achievement} />
                  <Text style={fin.muted}>
                    {pct(goal.achievement, 1)} de la meta · {money(goal.actual_amount)} de {money(goal.target_amount)}
                    {goal.target_loans ? ` · ${goal.actual_loans} de ${goal.target_loans} créditos` : ""}
                  </Text>
                </>
              ) : (
                <Text style={fin.muted}>No hay meta de colocación cargada para este mes.</Text>
              )}
              <Row label="Desembolsado" value={money(cur.disbursements.amount)} sub={<Delta current={cur.disbursements.amount} previous={prev?.disbursements.amount} polarity="higher" />} />
              <Row label="Crédito promedio" value={money(cur.disbursements.average)} />
              <Row label="Clientes nuevos / recurrentes" value={`${cur.disbursements.new_loans} / ${cur.disbursements.recurrent_loans}`} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Recuperación</Text>
              <Row label="Cobrado" value={money(cur.collections.total)} sub={<Delta current={cur.collections.total} previous={prev?.collections.total} polarity="higher" />} />
              <Row label="Esperado a cobrar" value={money(cur.collections.expected)} />
              <Text style={fin.muted}>Eficiencia de cobro</Text>
              <Progress value={cur.collections.efficiency} />
              <Row
                label={`${pct(cur.collections.efficiency, 1)} del esperado`}
                value=""
                sub={<Delta current={cur.collections.efficiency} previous={prev?.collections.efficiency} kind="pct" polarity="higher" />}
              />
              <Row label="Capital" value={money(cur.collections.principal)} />
              <Row label="Interés" value={money(cur.collections.interest)} />
              {Number(cur.collections.late_interest) > 0 && <Row label="Interés moratorio" value={money(cur.collections.late_interest)} />}
              <Row label="Seguro, comisión y otros" value={money(cur.collections.charges)} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Clientes</Text>
              <Row label="Clientes activos" value={String(cur.customers.active)} sub={<Delta current={cur.customers.active} previous={prev?.customers.active} polarity="higher" kind="count" />} />
              <Row label="Nuevos" value={String(cur.customers.new)} />
              <Row label="Recurrentes (volvieron a pedir)" value={String(cur.customers.recurrent)} />
              <Row label="Inactivos" value={String(cur.customers.inactive)} />
              <Row label="Retención" value={pct(cur.customers.retention_rate, 1)} sub={<Delta current={cur.customers.retention_rate} previous={prev?.customers.retention_rate} kind="pct" polarity="higher" />} />
              <Row label="Terminaron su crédito" value={String(cur.paid_off.loans)} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Saneados</Text>
              <Row label="Del período" value={money(cur.write_offs.period_amount)} sub={<Text style={fin.muted}>{cur.write_offs.period_loans} créditos</Text>} />
              <Row label="Acumulado" value={money(cur.write_offs.total_amount)} sub={<Text style={fin.muted}>{cur.write_offs.total_loans} créditos</Text>} />
              {cur.write_offs.recoveries_available && (
                <Row label="Recuperado del período" value={money(cur.write_offs.recovered_amount)} sub={<Text style={fin.muted}>{cur.write_offs.recovered_loans} créditos</Text>} />
              )}
            </View>

            {trend.length >= 2 && (
              <View style={fin.card}>
                <Text style={fin.title}>Últimos {trend.length} meses</Text>
                <Text style={fin.muted}>Colocado</Text>
                <MiniBars values={trend.map((t) => t.disbursed_amount)} labels={trend.map((t) => monthShort(t.period))} height={48} />
                <Text style={[fin.muted, { marginTop: SPACING.sm }]}>Cobrado</Text>
                <MiniBars values={trend.map((t) => t.collected_amount)} labels={trend.map((t) => monthShort(t.period))} height={48} color={COLORS.success} />
                <Text style={[fin.muted, { marginTop: SPACING.sm }]}>Clientes nuevos</Text>
                <MiniBars values={trend.map((t) => t.new_customers)} labels={trend.map((t) => monthShort(t.period))} height={36} color={COLORS.warning} />
              </View>
            )}

            {(data.top_promoters || []).length > 0 && (
              <View style={fin.card}>
                <Text style={fin.title}>Mejores promotores (colocación)</Text>
                {data.top_promoters.map((p, i) => (
                  <Row key={p.id} label={`${i + 1}. ${p.name}`} value={money(p.amount)} sub={<Text style={fin.muted}>{p.loans} {p.loans === 1 ? "crédito" : "créditos"}</Text>} />
                ))}
              </View>
            )}

            {(data.top_collectors || []).length > 0 && (
              <View style={fin.card}>
                <Text style={fin.title}>Mejores cobradores (cobrado)</Text>
                {data.top_collectors.map((c, i) => (
                  <Row key={c.id} label={`${i + 1}. ${c.name}`} value={money(c.amount)} sub={<Text style={fin.muted}>{c.payments} {c.payments === 1 ? "pago" : "pagos"}</Text>} />
                ))}
              </View>
            )}
          </ViewShot>

          <Button mode="outlined" icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
            Compartir como imagen
          </Button>
        </>
      )}
    </ScrollView>
  );
}
