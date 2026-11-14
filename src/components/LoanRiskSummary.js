import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Text, Button } from "react-native-paper";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";
import { money } from "../utils/format";
import { tceaFromAmortizationTable } from "../utils/tcea";

const n = (v) => Number(v) || 0;
const dmy = (iso) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : "—";
};

function Title({ children }) {
  return <Text style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs }}>{children}</Text>;
}

function Line({ label, value, bold }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, gap: SPACING.sm }}>
      <Text style={{ color: COLORS.muted, flexShrink: 1 }}>{label}</Text>
      <Text style={{ color: COLORS.text, fontWeight: bold ? "800" : "600", textAlign: "right" }}>{value}</Text>
    </View>
  );
}

// Indicador con fondo rojo suave cuando no cumple (igual que la web).
function Indicator({ label, value, hint, bad }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: bad ? COLORS.danger : COLORS.border,
        backgroundColor: bad ? COLORS.dangerSoft : COLORS.card,
        borderRadius: RADIUS.md,
        padding: SPACING.sm,
        marginTop: SPACING.sm,
      }}
    >
      <Text style={{ color: COLORS.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: bad ? COLORS.danger : COLORS.text, fontWeight: "800", fontSize: 16 }}>{value}</Text>
      {!!hint && <Text style={{ color: bad ? COLORS.danger : COLORS.muted, fontSize: 12 }}>{hint}</Text>}
    </View>
  );
}

const cell = (flex, align = "right") => ({ flex, textAlign: align, fontSize: 12, color: COLORS.text });

// Resumen de la solicitud como en el paso 3 de la web: costo del crédito, TCEA, indicadores de riesgo y tabla de cuotas.
// quote: { summary, table } de la simulación (lo que ya calcula la pantalla); sin permiso de amortización no hay tabla.
export default function LoanRiskSummary({
  quote,
  termMonths,
  amount,
  deduction,
  // Seguro descontado al desembolsar: sale del neto y no va en las cuotas.
  insuranceUpfront = 0,
  evaluation,
  guaranteeValue,
  minCoverage,
  activeSummary,
}) {
  const [showTable, setShowTable] = useState(false);
  const summary = quote?.summary || null;
  const table = quote?.table || [];

  const view = useMemo(() => {
    if (!summary) return null;
    const amt = n(amount);
    const net = amt - n(deduction) - n(insuranceUpfront);
    const totalToPay = summary.total;
    return { amt, net, totalToPay };
  }, [summary, amount, deduction, insuranceUpfront]);

  const tcea = useMemo(() => (view && table.length ? tceaFromAmortizationTable(view.net, table) : null), [view, table]);

  const totals = useMemo(() => {
    const rows = summary?.rows || [];
    const sum = (key) => rows.reduce((a, r) => a + n(r[key]), 0);
    return {
      interest: sum("interest"),
      fee: sum("feeByPayment"),
      insurance: sum("insuranceByPayment"),
      other: sum("otherChargesByPayment"),
    };
  }, [summary]);

  if (!summary || !view) return null;

  // Cuota mensual equivalente: el total a pagar entre el plazo en meses (mismo criterio que la web).
  const monthly = n(termMonths) > 0 ? view.totalToPay / n(termMonths) : 0;

  const hasEvaluation = !!evaluation?.id;
  const totalIncome = n(evaluation?.total_income);
  const capacity = totalIncome - n(evaluation?.total_expenses);
  const capacityPct = capacity > 0 && monthly > 0 ? (monthly / capacity) * 100 : null;
  const incomePct = totalIncome > 0 && monthly > 0 ? (monthly / totalIncome) * 100 : null;
  const coveragePct = view.amt > 0 ? (n(guaranteeValue) / view.amt) * 100 : null;
  const currentDebt = n(activeSummary?.total_balance);
  const activeCount = n(activeSummary?.count);

  return (
    <View style={{ gap: SPACING.md }}>
      <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md }}>
        <Title>Costo del crédito</Title>
        <Line label="Monto neto a recibir" value={money(view.net)} />
        <Line label="Total a pagar" value={money(view.totalToPay)} />
        <Line label="Costo total del crédito" value={money(view.totalToPay - view.net)} bold />
        <Line label="Intereses" value={money(totals.interest)} />
        <Line label="Comisiones" value={money(totals.fee + n(deduction))} />
        <Line label="Seguros" value={money(totals.insurance + n(insuranceUpfront))} />
        <Line label="Otros cargos" value={money(totals.other)} />
        <Line label="TCEA" value={tcea != null ? `${tcea.toFixed(2)}%` : "—"} />
      </View>

      <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md }}>
        <Title>Indicadores de riesgo</Title>
        <Indicator
          label="Cobertura de garantías"
          value={coveragePct != null ? `${coveragePct.toFixed(0)}%` : "—"}
          hint={minCoverage != null ? `Mínimo de política: ${minCoverage}%` : "Sin mínimo configurado"}
          bad={minCoverage != null && coveragePct != null && coveragePct < minCoverage}
        />
        <Indicator
          label="Cuota / capacidad de pago"
          value={capacityPct != null ? `${capacityPct.toFixed(0)}%` : "—"}
          hint={
            !hasEvaluation
              ? "Sin evaluación financiera"
              : capacityPct != null
                ? `Cuota mensual ${money(monthly)} de ${money(capacity)} disponibles`
                : "Gastos iguales o mayores a ingresos"
          }
          bad={hasEvaluation && (capacityPct == null || capacityPct > 100)}
        />
        <Indicator
          label="Cuota / ingreso total"
          value={incomePct != null ? `${incomePct.toFixed(0)}%` : "—"}
          hint={
            !hasEvaluation
              ? "Sin evaluación financiera"
              : incomePct != null
                ? "Porción del ingreso mensual del cliente"
                : "La evaluación no tiene ingresos registrados"
          }
          bad={incomePct != null && incomePct > 100}
        />
        <Indicator
          label="Deuda total con la institución"
          value={money(currentDebt + view.amt)}
          hint={
            activeCount
              ? `${money(currentDebt)} en ${activeCount} crédito${activeCount === 1 ? "" : "s"} activo${activeCount === 1 ? "" : "s"} + este crédito`
              : "Sin otros créditos activos"
          }
        />
      </View>

      <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md }}>
        <Title>Tabla de amortización</Title>
        <Button mode="text" icon={showTable ? "chevron-up" : "chevron-down"} onPress={() => setShowTable((v) => !v)} style={{ alignSelf: "flex-start" }}>
          {showTable ? "Ocultar" : `Ver las ${summary.installments} cuotas`}
        </Button>
        {showTable && (
          <View>
            <View style={{ flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <Text style={[cell(0.5, "left"), { fontWeight: "800" }]}>#</Text>
              <Text style={[cell(1.4, "left"), { fontWeight: "800" }]}>Fecha</Text>
              <Text style={[cell(1.3), { fontWeight: "800" }]}>Cuota</Text>
              <Text style={[cell(1.3), { fontWeight: "800" }]}>Capital</Text>
              <Text style={[cell(1.3), { fontWeight: "800" }]}>Interés</Text>
            </View>
            {summary.rows.map((r) => (
              <View key={r.paymentNumber} style={{ flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.border }}>
                <Text style={cell(0.5, "left")}>{r.paymentNumber}</Text>
                <Text style={cell(1.4, "left")}>{dmy(r.paymentDate)}</Text>
                <Text style={cell(1.3)}>{n(r.paymentAmount).toFixed(2)}</Text>
                <Text style={cell(1.3)}>{n(r.principal).toFixed(2)}</Text>
                <Text style={cell(1.3)}>{n(r.interest).toFixed(2)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", paddingVertical: 6 }}>
              <Text style={[cell(1.9, "left"), { fontWeight: "800" }]}>Totales</Text>
              <Text style={[cell(1.3), { fontWeight: "800" }]}>{view.totalToPay.toFixed(2)}</Text>
              <Text style={[cell(1.3), { fontWeight: "800" }]}>{summary.principal.toFixed(2)}</Text>
              <Text style={[cell(1.3), { fontWeight: "800" }]}>{totals.interest.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
