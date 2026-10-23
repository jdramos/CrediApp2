import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { Text, Button } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../../auth/SessionContext";
import { getFinancialPosition } from "../../api/financeApi";
import { useTenantLogo } from "../../hooks/useTenantLogo";
import ShareCardHeader from "../../components/ShareCardHeader";
import { shareImage } from "../../utils/shareImage";
import { money } from "../../utils/format";
import { COLORS } from "../../theme/colors";
import { RADIUS, SPACING } from "../../theme/layout";
import { fin, MonthNav, periodLabel, currentPeriod, Delta, Row, Loading, ErrorBox } from "./ui";

// Una sección del balance (Activos, Pasivos, Patrimonio): cada renglón con su
// variación contra el mes anterior, y el total.
function Section({ title, section, polarity }) {
  return (
    <View style={fin.card}>
      <Text style={fin.title}>{title}</Text>
      {section.lines
        .filter((l) => Math.abs(l.value) > 0.005 || Math.abs(l.previous) > 0.005)
        .map((l) => (
          <Row key={l.key} label={l.label} value={money(l.value)} sub={<Delta current={l.value} previous={l.previous} polarity="neutral" />} />
        ))}
      <Row label={`Total ${title.toLowerCase()}`} value={money(section.total)} strong sub={<Delta current={section.total} previous={section.previous} polarity={polarity} />} />
    </View>
  );
}

// Situación financiera (permiso contabilidad.ver): balance al corte del mes con la
// variación contra el mes anterior, resultados del mes y del año, y datos de la
// cartera según la contabilidad. Consolidado de toda la empresa.
export default function PositionTab() {
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const res = await getFinancialPosition(session.token, period);
        setData(res?.data || null);
      } catch (e) {
        setData(null);
        setError(e?.message || "No se pudo cargar la situación financiera. Revisá tu conexión.");
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
      await shareImage(uri, "Situación financiera");
    } catch (e) {
      setError(e?.message || "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const r = data?.results;

  return (
    <ScrollView
      contentContainerStyle={fin.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <MonthNav period={period} onChange={setPeriod} disabled={loading} />

      {loading && !data && <Loading />}
      {!!error && <ErrorBox message={error} onRetry={() => load()} />}

      {data && !data.has_accounting_data && (
        <View style={fin.card}>
          <Text style={fin.muted}>No hay movimientos contables hasta el {data.cut_date}.</Text>
        </View>
      )}

      {data && data.has_accounting_data && (
        <>
          <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={{ gap: SPACING.md, backgroundColor: COLORS.bg }}>
            <ShareCardHeader
              logoUrl={logoUrl}
              tenantName={session?.tenant?.commercial_name || session?.tenant?.legal_name}
              title="Situación financiera"
              lines={[`${periodLabel(data.period)} · al ${data.cut_date}`, `Variación contra ${periodLabel(data.previous_period)}`]}
            />

            <Section title="Activos" section={data.assets} polarity="neutral" />
            <Section title="Pasivos" section={data.liabilities} polarity="neutral" />
            <Section title="Patrimonio" section={data.equity} polarity="higher" />

            {Math.abs(data.difference) > 0.5 && (
              <Text style={{ color: COLORS.danger, fontSize: 12 }}>
                Atención: activos menos pasivos y patrimonio no cuadran por {money(data.difference)}.
              </Text>
            )}

            <View style={fin.card}>
              <Text style={fin.title}>Resultados</Text>
              <Text style={fin.muted}>{periodLabel(data.period)}</Text>
              <Row label="Ingresos del mes" value={money(r.income_month)} />
              <Row label="Gastos del mes" value={money(r.expense_month)} />
              <Row label="Resultado del mes" value={money(r.net_month)} strong color={r.net_month < 0 ? COLORS.danger : COLORS.success} />
              <Text style={[fin.muted, { marginTop: SPACING.sm }]}>Acumulado del año</Text>
              <Row label="Ingresos" value={money(r.income_ytd)} />
              <Row label="Gastos" value={money(r.expense_ytd)} />
              <Row label="Resultado del año" value={money(r.net_ytd)} strong color={r.net_ytd < 0 ? COLORS.danger : COLORS.success} />
            </View>

            <View style={fin.card}>
              <Text style={fin.title}>Cartera según la contabilidad</Text>
              <Row label="Cartera bruta" value={money(data.portfolio.gross)} sub={<Delta current={data.portfolio.gross} previous={data.portfolio.gross_prev} polarity="higher" />} />
              <Row label="Cartera vencida" value={money(data.portfolio.past_due)} />
              <Row label="Cartera reestructurada" value={money(data.portfolio.restructured)} />
              <Row label="Provisión acumulada" value={money(data.portfolio.provisions)} />
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
