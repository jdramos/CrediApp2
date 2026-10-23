import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Chip, Button } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../../auth/SessionContext";
import { getFinancialIndicators } from "../../api/financeApi";
import { useTenantLogo } from "../../hooks/useTenantLogo";
import ShareCardHeader from "../../components/ShareCardHeader";
import { shareImage } from "../../utils/shareImage";
import { COLORS } from "../../theme/colors";
import { RADIUS, SPACING } from "../../theme/layout";
import { fin, MonthNav, periodLabel, Delta, LevelChip, Loading, ErrorBox, pct, MiniBars, monthShort } from "./ui";

const formatValue = (ind, v) => (v == null ? "—" : ind.unit === "pct" ? pct(v) : `${Number(v).toFixed(2)} veces`);

// Indicadores financieros (permiso contabilidad.ver): los del formato de la CONAMI,
// por grupo, con el mes anterior, la mediana del sector y su nivel. Tocar un
// indicador muestra qué mide, su fórmula y el análisis.
export default function IndicatorsTab() {
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);
  const [period, setPeriod] = useState(null); // null = el último mes con reporte del sector
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [group, setGroup] = useState("all");
  const [open, setOpen] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const res = await getFinancialIndicators(session.token, period);
        setData(res?.data || null);
        if (!period && res?.data?.period) setPeriod(res.data.period);
      } catch (e) {
        setError(e?.message || "No se pudieron cargar los indicadores. Revisá tu conexión.");
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
      await shareImage(uri, "Indicadores financieros");
    } catch (e) {
      setError(e?.message || "No se pudo generar la imagen para compartir");
    } finally {
      setSharing(false);
    }
  };

  const indicators = (data?.indicators || []).filter((i) => group === "all" || i.group === group);
  const sectorOk = !!data?.sector && !data?.sector_period_mismatch;

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
          <Text style={fin.muted}>No hay movimientos contables hasta el {data.cut_date}: los indicadores aparecen cuando la contabilidad tiene datos.</Text>
        </View>
      )}

      {data && (
        <>
          <IndicatorGroups groups={data.groups} value={group} onChange={setGroup} />
          <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={{ gap: SPACING.md, backgroundColor: COLORS.bg }}>
            <ShareCardHeader
              logoUrl={logoUrl}
              tenantName={session?.tenant?.commercial_name || session?.tenant?.legal_name}
              title="Indicadores financieros"
              lines={[`${periodLabel(data.period)} · corte al ${data.cut_date}`, sectorOk ? "Comparado con la mediana del sector (CONAMI)" : "Sin datos del sector para este mes"]}
            />

            {!!data.summary?.overview && (
              <View style={fin.card}>
                <Text style={fin.muted}>{data.summary.overview}</Text>
              </View>
            )}

            {indicators.map((ind) => {
              const expanded = open === ind.key;
              // Tendencia: el valor de este indicador en cada uno de los últimos 6 meses.
              const series = data.series || [];
              const trend = series.map((sr) => sr.values?.[ind.key] ?? null);
              const known = trend.filter((v) => v != null);
              const first = known[0];
              const last = known[known.length - 1];
              return (
                <Pressable key={ind.key} onPress={() => setOpen(expanded ? null : ind.key)} style={fin.card}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm }}>
                    <Text style={[fin.rowLabel, { fontWeight: "700", fontSize: 13 }]}>{ind.label}</Text>
                    <LevelChip level={ind.level} levels={data.levels} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
                    <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 22 }}>{formatValue(ind, ind.value)}</Text>
                    <View style={{ alignItems: "flex-end" }}>
                      {ind.previous != null && (
                        <Text style={fin.muted}>
                          Mes anterior {formatValue(ind, ind.previous)}
                        </Text>
                      )}
                      <Delta current={ind.value} previous={ind.previous} kind="pct" polarity={ind.polarity} />
                    </View>
                  </View>
                  {known.length >= 2 && (
                    <View>
                      <MiniBars values={trend} labels={series.map((sr) => monthShort(sr.period))} />
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                        <Text style={fin.muted}>
                          {series.length} meses: {formatValue(ind, first)} → {formatValue(ind, last)}
                        </Text>
                        <Delta current={last} previous={first} kind="pct" polarity={ind.polarity} />
                      </View>
                    </View>
                  )}
                  {sectorOk && ind.sector?.median != null && (
                    <Text style={fin.muted}>
                      Sector: mediana {formatValue(ind, ind.sector.median)}
                      {ind.percentile != null ? ` · percentil ${ind.percentile}` : ""}
                    </Text>
                  )}
                  {expanded && (
                    <View style={{ marginTop: SPACING.xs, gap: 4 }}>
                      {!!ind.what && <Text style={{ color: COLORS.text, fontSize: 12 }}>{ind.what}</Text>}
                      {!!ind.formula && <Text style={fin.muted}>Fórmula: {ind.formula}</Text>}
                      {!!ind.parts && (
                        <Text style={fin.muted}>
                          {ind.parts.num_label}: {Number(ind.parts.num).toLocaleString("es-NI", { maximumFractionDigits: 2 })} · {ind.parts.den_label}:{" "}
                          {Number(ind.parts.den).toLocaleString("es-NI", { maximumFractionDigits: 2 })}
                        </Text>
                      )}
                      {!!ind.text && <Text style={{ color: COLORS.text, fontSize: 12 }}>{ind.text}</Text>}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ViewShot>

          <Button mode="outlined" icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} style={{ borderRadius: RADIUS.md }} contentStyle={{ height: 46 }}>
            Compartir como imagen
          </Button>

          {(data.summary?.paragraphs || []).length > 0 && (
            <>
              <Button mode="text" icon={showAnalysis ? "chevron-up" : "text-box-search-outline"} onPress={() => setShowAnalysis(!showAnalysis)}>
                {showAnalysis ? "Ocultar análisis" : "Ver análisis por tema"}
              </Button>
              {showAnalysis &&
                data.summary.paragraphs.map((p) => (
                  <View key={p.pillar} style={fin.card}>
                    <Text style={fin.title}>{p.pillar}</Text>
                    <Text style={{ color: COLORS.text, fontSize: 12 }}>{p.text}</Text>
                  </View>
                ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// Filtro por grupo (Activos, Pasivos, Rentabilidad...), arriba de la lista.
export function IndicatorGroups({ groups, value, onChange }) {
  const chip = (key, label) => (
    <Chip key={key} selected={value === key} showSelectedCheck={false} onPress={() => onChange(key)} style={{ backgroundColor: value === key ? COLORS.primarySoft : COLORS.card }}>
      {label}
    </Chip>
  );
  // Una sola fila que se desliza hacia los lados, para no ocupar media pantalla.
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.xs, paddingRight: SPACING.lg }} style={{ flexGrow: 0 }}>
      {chip("all", "Todos")}
      {(groups || []).map((g) => chip(g.key, g.label))}
    </ScrollView>
  );
}
