import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { Text, Chip, Button } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../../auth/SessionContext";
import { getPortfolioSummary, getPortfolioAging, getPortfolioRisk, getPortfolioByBranch } from "../../api/financeApi";
import { getAccessibleBranches } from "../../api/branchApi";
import { useTenantLogo } from "../../hooks/useTenantLogo";
import ShareCardHeader from "../../components/ShareCardHeader";
import { shareImage } from "../../utils/shareImage";
import { money } from "../../utils/format";
import { todayISO } from "../../utils/date";
import { COLORS } from "../../theme/colors";
import { RADIUS, SPACING } from "../../theme/layout";
import { fin, Kpi, Row, Loading, ErrorBox, pct } from "./ui";

const RISK_LABEL = { A: "A · Normal", B: "B · Potencial", C: "C · Real", D: "D · Dudosa", E: "E · Irrecuperable" };

// Saldos de cartera al último cierre diario (permiso balances.ver): totales,
// vencida y provisión, antigüedad de la mora, categorías de riesgo y reparto por
// sucursal. El servidor ya limita a las sucursales del usuario.
export default function PortfolioTab() {
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);
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
        const [summary, aging, risk, byBranch] = await Promise.all([
          getPortfolioSummary(session.token, branchId),
          getPortfolioAging(session.token, branchId),
          getPortfolioRisk(session.token, branchId),
          getPortfolioByBranch(session.token),
        ]);
        setData({ summary: summary?.data, aging: aging?.data || [], risk: risk?.data || [], byBranch: byBranch?.data || [] });
      } catch (e) {
        setError(e?.message || "No se pudieron cargar los saldos de cartera. Revisá tu conexión.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session.token, branchId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onShare = async () => {
    try {
      setSharing(true);
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Saldos de cartera");
    } catch (e) {
      setError(e?.message || "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const s = data?.summary;
  const agingTotal = (data?.aging || []).reduce((a, r) => a + Number(r.total_balance || 0), 0);
  const branchName = branchId ? branches.find((b) => b.id === branchId)?.name : "Todas mis sucursales";

  return (
    <ScrollView
      contentContainerStyle={fin.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
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

      {s && (
        <>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={{ gap: SPACING.md, backgroundColor: COLORS.bg }}>
            <ShareCardHeader
              logoUrl={logoUrl}
              tenantName={session?.tenant?.commercial_name || session?.tenant?.legal_name}
              title="Saldos de cartera"
              lines={[branchName, `Último cierre de saldos · consultado el ${todayISO()}`]}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm }}>
              <Kpi label="Cartera total" value={money(s.total_portfolio)} note={`${s.total_loans} créditos · ${s.total_customers} clientes`} />
              <Kpi label="Cartera vencida" value={money(s.overdue_portfolio)} note={`${pct(s.overdue_rate)} de la cartera`} color={COLORS.danger} />
              <Kpi label="Capital" value={money(s.total_capital)} />
              <Kpi label="Provisión estimada" value={money(s.estimated_provision)} color={COLORS.warning} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Composición de la cartera</Text>
              <Row label="Capital" value={money(s.total_capital)} />
              <Row label="Interés" value={money(s.total_interest)} />
              <Row label="Seguro" value={money(s.total_insurance)} />
              <Row label="Comisión" value={money(s.total_fee)} />
              {Number(s.total_other_charges) > 0 && <Row label="Otros cargos" value={money(s.total_other_charges)} />}
              <Row label="Total" value={money(s.total_portfolio)} strong />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Antigüedad de la mora</Text>
              {data.aging.map((r) => {
                const share = agingTotal > 0 ? (Number(r.total_balance) / agingTotal) * 100 : 0;
                const late = r.bucket !== "Al día";
                return (
                  <View key={r.bucket} style={{ marginBottom: 4 }}>
                    <View style={fin.row}>
                      <Text style={fin.rowLabel}>{r.bucket === "Al día" ? "Al día" : `${r.bucket} días`}</Text>
                      <Text style={fin.rowValue}>{money(r.total_balance)} · {pct(share, 1)}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: COLORS.bg }}>
                      <View style={{ width: `${Math.min(100, Math.max(share, 0.5))}%`, height: 6, borderRadius: 3, backgroundColor: late ? COLORS.danger : COLORS.success }} />
                    </View>
                  </View>
                );
              })}
            </View>

            {data.risk.length > 0 && (
              <View style={fin.card}>
                <Text style={fin.title}>Categorías de riesgo</Text>
                {data.risk.map((r) => (
                  <Row
                    key={r.risk_code}
                    label={RISK_LABEL[r.risk_code] || `Categoría ${r.risk_code}`}
                    value={money(r.total_portfolio)}
                    sub={<Text style={fin.muted}>{r.total_loans} créditos · provisión {money(r.estimated_provision)}</Text>}
                  />
                ))}
              </View>
            )}

            {!branchId && data.byBranch.length > 1 && (
              <View style={fin.card}>
                <Text style={fin.title}>Por sucursal</Text>
                {data.byBranch.map((b) => (
                  <Row
                    key={b.branch_id}
                    label={b.branch_name}
                    value={money(b.total_portfolio)}
                    sub={
                      <Text style={fin.muted}>
                        {b.total_loans} créditos · vencida {money(b.overdue_portfolio)} ({pct(b.total_portfolio > 0 ? (b.overdue_portfolio / b.total_portfolio) * 100 : 0, 1)})
                      </Text>
                    }
                  />
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
