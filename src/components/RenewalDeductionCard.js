// «Descontar el saldo completo de un crédito vigente del cliente» en la
// solicitud (igual que la web, RenewalDeductionField.jsx). Credilix,
// 2026-11-24: el #8549 se ingresó desde la app sin esta opción y el saldo del
// crédito anterior no se iba a descontar. Viaja como renews_loan_id: al
// desembolsar, el neto cancela ese crédito con su saldo de ese día.
import React from "react";
import { View } from "react-native";
import { Text, Checkbox, HelperText } from "react-native-paper";
import CatalogPickerField from "./CatalogPickerField";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";
import { money } from "../utils/format";

const balanceOf = (l) => Number(l.display_balance ?? l.current_balance ?? 0);

// Problema que impide enviar la solicitud (null = se puede). Sin señal no se
// bloquea: el servidor lo valida al recibirla.
export function renewalProblem({ renewsLoanId, quote, net }) {
  if (!renewsLoanId) return null;
  if (quote.loading) return "Espere: se está calculando el saldo del crédito a descontar.";
  if (quote.error && !quote.offline) return quote.error;
  const q = quote.data;
  if (!q) return null;
  if (!q.can_renew) return q.blocking || "Ese crédito no se puede descontar.";
  if (q.payoff_error) return q.payoff_error;
  if (Number(q.payoff_today || 0) > net) {
    return `El monto menos la deducción (${money(net)}) no alcanza para cancelar el saldo de hoy (${money(q.payoff_today)}).`;
  }
  return null;
}

export default function RenewalDeductionCard({ loans, renewsLoanId, onChange, quote, net, cardStyle }) {
  if (!loans || !loans.length) return null;
  const checked = Boolean(renewsLoanId);
  const payoff = checked && quote.data?.can_renew ? Number(quote.data.payoff_today || 0) : 0;
  const problem = renewalProblem({ renewsLoanId, quote, net });
  return (
    <View style={cardStyle}>
      <Text style={{ fontWeight: "800", color: COLORS.text }}>Deducciones: saldo de crédito vigente</Text>
      <Checkbox.Item
        label="Descontar el saldo completo de un crédito vigente del cliente"
        status={checked ? "checked" : "unchecked"}
        onPress={() => onChange(checked ? null : loans[0].id)}
        position="leading"
        labelStyle={{ textAlign: "left", color: COLORS.text }}
        style={{ paddingHorizontal: 0 }}
        accessibilityLabel="Descontar el saldo completo de un crédito vigente del cliente"
      />
      {!checked && (
        <View style={{ backgroundColor: COLORS.warningSoft, borderRadius: RADIUS.md, padding: SPACING.sm }}>
          <Text style={{ color: COLORS.text }}>
            {loans.length === 1 ? "El cliente tiene el crédito " : "El cliente tiene los créditos "}
            {loans.map((l) => `#${l.credit_code || l.id} (saldo ${money(balanceOf(l))})`).join(", ")}
            {loans.length === 1 ? " vigente" : " vigentes"}. Si no marca esta casilla, ese saldo no se descuenta: se le
            entrega el neto completo y el crédito anterior sigue abierto, cobrándose aparte.
          </Text>
        </View>
      )}
      {checked && (
        <View style={{ gap: SPACING.xs }}>
          {loans.length > 1 && (
            <CatalogPickerField
              label="Crédito a cancelar"
              value={String(renewsLoanId)}
              options={loans.map((l) => ({ id: String(l.id), label: `Crédito #${l.credit_code || l.id} — saldo ${money(balanceOf(l))}` }))}
              onChange={(id) => onChange(id || null)}
            />
          )}
          {quote.loading && <Text style={{ color: COLORS.muted }}>Calculando el saldo de hoy…</Text>}
          {quote.data?.can_renew && !quote.data.payoff_error && (
            <>
              <Row label={`Saldo a descontar (hoy) — crédito #${quote.data.loan?.credit_code || quote.data.loan?.id}`} value={money(payoff)} />
              <Row label="Monto − deducción" value={money(net)} />
              <Row label="Neto a entregar (estimado)" value={money(net - payoff)} danger={net - payoff < 0} />
            </>
          )}
          {problem ? (
            <HelperText type="error" style={{ paddingHorizontal: 0 }}>{problem}</HelperText>
          ) : quote.offline ? (
            <HelperText type="info" style={{ paddingHorizontal: 0 }}>Sin señal: el saldo se calcula al enviarla.</HelperText>
          ) : (
            <HelperText type="info" style={{ paddingHorizontal: 0 }}>
              Al desembolsar se cancela ese crédito con su saldo de ese día y se entrega la diferencia.
            </HelperText>
          )}
        </View>
      )}
    </View>
  );
}

function Row({ label, value, danger }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm }}>
      <Text style={{ color: COLORS.muted, flexShrink: 1 }}>{label}</Text>
      <Text style={{ fontWeight: "800", color: danger ? COLORS.danger : COLORS.text }}>{value}</Text>
    </View>
  );
}
