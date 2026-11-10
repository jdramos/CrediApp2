import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import { buildCuotaLines, buildPaymentLines, compactTotals, fmtAmount, fmtDMY, fmtDMYShort, moraSummary, officerLabel } from "../utils/compactStatement";

// Estado de cuenta "solo totales" (política estado_cuenta_solo_totales de la empresa): el formato del sistema
// anterior. Cuotas a la izquierda y pagos a la derecha, cada pago por su TOTAL (sin repartir por cuota ni en
// capital e intereses). Ver utils/compactStatement.js.

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  title: { fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: SPACING.sm },
  infoItem: { width: "50%", paddingVertical: 2, paddingRight: SPACING.sm },
  infoLabel: { color: COLORS.muted, fontSize: 10, textTransform: "uppercase" },
  infoValue: { color: COLORS.text, fontWeight: "700", fontSize: 13 },
  groupRow: { flexDirection: "row", borderBottomWidth: 0 },
  group: { flex: 1, textAlign: "center", fontWeight: "800", color: COLORS.muted, fontSize: 10, letterSpacing: 4 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 3 },
  headText: { color: COLORS.text, fontWeight: "800", fontSize: 10, textAlign: "center" },
  row: { flexDirection: "row", paddingVertical: 3 },
  note: { color: COLORS.warning, fontWeight: "700", fontSize: 9.5, paddingBottom: 2 },
  moraBox: { borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.sm },
  moraTitle: { fontWeight: "900", fontSize: 14 },
  moraRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 2 },
  cell: { color: COLORS.text, fontSize: 11.5 },
  totals: { flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border, borderStyle: "dashed", paddingTop: 6, marginTop: 4 },
  balance: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6 },
});

// Anchos relativos de las 6 columnas: Cuota · Fecha · Total | Documento · Fecha · Pagado.
const W = { n: 0.55, due: 1.1, total: 1.15, doc: 1.35, date: 1.1, paid: 1.15 };

const Info = ({ label, value }) => (
  <View style={styles.infoItem}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value || "—"}</Text>
  </View>
);

export default function CompactStatementCard({ statement }) {
  const cuotas = buildCuotaLines(statement.movements);
  const pagos = buildPaymentLines(statement);
  const count = Math.max(cuotas.length, pagos.length);
  const totals = compactTotals(statement);
  const mora = moraSummary(statement);
  const inMora = mora.count > 0 || mora.days > 0;
  const rate = Number(statement.approved_rate || statement.interest_rate || 0);

  return (
    <View style={styles.card}>
      <Text variant="titleMedium" style={styles.title}>Estado de cuenta por cliente</Text>

      <View style={styles.infoGrid}>
        <Info label="Crédito n°" value={String(statement.credit_code || statement.loan_id || "")} />
        <Info label="Fecha desembolso" value={fmtDMY(statement.disbursement_date)} />
        <Info label="Interés %" value={`${rate}%`} />
        <Info label="Plazo" value={Number(statement.approved_term || statement.term || 0).toFixed(2)} />
        <Info label="Fecha vencimiento" value={fmtDMY(statement.due_date)} />
        <Info label="Concurrencia" value={statement.frequency_name || statement.frequency} />
        <Info label="Oficial" value={officerLabel(statement)} />
      </View>

      {/* Mora a la fecha de corte: si tiene, cuántos días, cuántas cuotas y cuánto. */}
      <View style={[styles.moraBox, { backgroundColor: inMora ? COLORS.dangerSoft : COLORS.successSoft }]}>
        <Text style={[styles.moraTitle, { color: inMora ? COLORS.danger : COLORS.success }]}>
          {inMora ? "En mora" : "Al día, sin mora"}
        </Text>
        {inMora && (
          <>
            <View style={styles.moraRow}>
              <Text style={{ color: COLORS.text }}>Días de mora</Text>
              <Text style={{ color: COLORS.danger, fontWeight: "800" }}>{mora.days}</Text>
            </View>
            <View style={styles.moraRow}>
              <Text style={{ color: COLORS.text }}>Cuotas en mora</Text>
              <Text style={{ color: COLORS.danger, fontWeight: "800" }}>{mora.count}</Text>
            </View>
            <View style={styles.moraRow}>
              <Text style={{ color: COLORS.text }}>Monto en mora</Text>
              <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 15 }}>C$ {fmtAmount(mora.amount)}</Text>
            </View>
            {!!mora.since && <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>Desde el {fmtDMY(mora.since)}</Text>}
          </>
        )}
      </View>

      <View style={styles.groupRow}>
        <Text style={[styles.group, { flex: W.n + W.due + W.total }]}>CUOTAS</Text>
        <Text style={[styles.group, { flex: W.doc + W.date + W.paid }]}>PAGOS</Text>
      </View>
      <View style={styles.head}>
        <Text style={[styles.headText, { flex: W.n }]}>N°</Text>
        <Text style={[styles.headText, { flex: W.due }]}>Fecha</Text>
        <Text style={[styles.headText, { flex: W.total, textAlign: "right" }]}>Total</Text>
        <Text style={[styles.headText, { flex: W.doc }]}>Documento</Text>
        <Text style={[styles.headText, { flex: W.date }]}>Fecha</Text>
        <Text style={[styles.headText, { flex: W.paid, textAlign: "right" }]}>Pago total</Text>
      </View>

      {count === 0 && <Text style={{ color: COLORS.muted, paddingVertical: SPACING.sm }}>No hay cuotas para mostrar.</Text>}
      {Array.from({ length: count }, (_, idx) => {
        const c = cuotas[idx];
        const p = pagos[idx];
        return (
          <View key={idx}>
          <View style={styles.row}>
            <Text style={[styles.cell, { flex: W.n, textAlign: "center" }]}>{c ? c.n : ""}</Text>
            <Text style={[styles.cell, { flex: W.due, textAlign: "center" }]}>{c ? fmtDMYShort(c.due) : ""}</Text>
            <Text style={[styles.cell, { flex: W.total, textAlign: "right" }]}>{c ? fmtAmount(c.total) : ""}</Text>
            <Text style={[styles.cell, { flex: W.doc, textAlign: "center", fontSize: 10.5 }]}>{p ? p.doc : ""}</Text>
            <Text style={[styles.cell, { flex: W.date, textAlign: "center" }]}>{p ? fmtDMYShort(p.date) : ""}</Text>
            <Text style={[styles.cell, { flex: W.paid, textAlign: "right", color: COLORS.success, fontWeight: "700" }]}>{p ? fmtAmount(p.amount) : ""}</Text>
          </View>
          {!!c?.note && (
            <View style={{ flexDirection: "row" }}>
              <Text style={[styles.note, { flex: W.n + W.due + W.total }]}>{c.note}</Text>
              <View style={{ flex: W.doc + W.date + W.paid }} />
            </View>
          )}
          </View>
        );
      })}

      <View style={styles.totals}>
        <Text style={[styles.cell, { flex: W.n + W.due, fontWeight: "800" }]}>TOTALES</Text>
        <Text style={[styles.cell, { flex: W.total, textAlign: "right", fontWeight: "800" }]}>{fmtAmount(totals.installments)}</Text>
        <Text style={[styles.cell, { flex: W.doc + W.date, textAlign: "right", fontWeight: "800", paddingRight: 8 }]}>PAGO TOTAL</Text>
        <Text style={[styles.cell, { flex: W.paid, textAlign: "right", fontWeight: "800", color: COLORS.success }]}>{fmtAmount(totals.paid)}</Text>
      </View>
      <View style={styles.balance}>
        <Text style={{ color: COLORS.text, fontWeight: "900" }}>SALDO TOTAL</Text>
        <Text style={{ color: COLORS.primary, fontWeight: "900", fontSize: 18 }}>C$ {fmtAmount(totals.balance)}</Text>
      </View>
    </View>
  );
}
