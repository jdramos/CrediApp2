// Estado de cuenta "solo totales" (JELDER, 2026-11-10; política estado_cuenta_solo_totales, la manda el servidor
// en header.statement_totals_only): el formato del sistema anterior. A la izquierda las cuotas (número, fecha y
// total) y a la derecha los pagos recibidos (documento, fecha y TOTAL del pago), sin repartir por cuota ni en
// capital e intereses: un pago de 3,580 que cubrió varias cuotas es UNA línea de 3,580. Al final el pago total y el
// saldo total. Igual que la impresión de la web (credimaster-frontend/src/reports/accountStatementCompactReport.js).
//
// statement = la respuesta de GET /api/loans/:id/account-statement aplanada: { ...header, movements, payments,
// payment_list }. payment_list trae TODOS los pagos vigentes hasta el corte (también los migrados); un servidor
// anterior no la manda y se usan los pagos con cuotas aplicadas (payments[].payment_total).

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const fmtAmount = (v) => num(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ymd = (v) => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};
// "2026-11-09" -> "09/11/2026"
export const fmtDMY = (v) => {
  const s = ymd(v);
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
};
// "2026-11-09" -> "09/11/26"
export const fmtDMYShort = (v) => {
  const s = ymd(v);
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : "";
};

const receiptNo = (id) => {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)).padStart(6, "0") : "";
};

// Cuota reprogramada (dueño, 2026-11-10): las cuotas de un feriado que se pasaron al final del plan conservan su
// número; el servidor las manda con rescheduled, rescheduled_from (fecha original) y rescheduled_reason y el
// estado de cuenta las muestra por fecha con esta nota. Igual que la web (utils/rescheduledInstallment.js).
export function rescheduledNote(row) {
  if (!row?.rescheduled) return "";
  const reason = row.rescheduled_reason && row.rescheduled_reason !== "Reprogramada" ? ` por ${String(row.rescheduled_reason).toLowerCase()}` : "";
  return row.rescheduled_from ? `Reprogramada${reason}: era el ${fmtDMY(row.rescheduled_from)}` : `Reprogramada${reason}`;
}

// Cuotas: sin la fila 0 del desembolso.
export function buildCuotaLines(movements = []) {
  return (movements || [])
    .filter((m) => Number(m.payment_number) > 0)
    .map((m) => ({
      n: m.payment_number,
      due: m.payment_date,
      total: num(m.installment_total),
      note: rescheduledNote(m),
      movedFrom: m.rescheduled ? ymd(m.rescheduled_from) || true : null,
    }));
}

// Pagos: uno por línea con su total, del más antiguo al más reciente.
export function buildPaymentLines(statement) {
  const list = Array.isArray(statement?.payment_list) && statement.payment_list.length
    ? statement.payment_list
    : statement?.payments || [];
  return list
    .map((p) => ({ doc: `RC ${receiptNo(p.payment_id)}`, date: p.payment_date, amount: num(p.payment_total ?? p.total) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.doc.localeCompare(b.doc));
}

export function compactTotals(statement) {
  return {
    installments: buildCuotaLines(statement?.movements).reduce((s, c) => s + c.total, 0),
    paid: buildPaymentLines(statement).reduce((s, p) => s + p.amount, 0),
    balance: num(statement?.total_balance),
  };
}

// Mora a la fecha de corte: días (del servidor), cuotas vencidas sin pagar completas y cuánto falta de ellas
// (mismo cálculo que "atrasado" del resumen: lo pendiente de las cuotas OVERDUE).
export function moraSummary(statement) {
  const overdue = (statement?.movements || []).filter((m) => Number(m.payment_number) > 0 && String(m.status).toUpperCase() === "OVERDUE");
  const since = overdue.map((m) => String(m.payment_date).slice(0, 10)).sort()[0] || null;
  return {
    days: num(statement?.defaulted_days),
    count: overdue.length,
    amount: Math.round(overdue.reduce((s, m) => s + num(m.pending_total), 0) * 100) / 100,
    since,
  };
}

// "6-RUTA 6": el gestor del crédito (el "Oficial" del sistema anterior).
export const officerLabel = (statement) =>
  statement?.collector_name
    ? [statement.collector_id, statement.collector_name].filter(Boolean).join("-")
    : statement?.vendor_name || statement?.promoter_name || "";

// ---- Ticket de 58 mm (32 columnas) ----------------------------------------------------
const WIDTH = 32;
const divider = () => "-".repeat(WIDTH);
const center = (t) => {
  const s = String(t ?? "");
  return " ".repeat(Math.max(0, Math.floor((WIDTH - s.length) / 2))) + s;
};
const twoCol = (l, r) => {
  const a = String(l ?? "");
  const b = String(r ?? "");
  return a + " ".repeat(Math.max(1, WIDTH - a.length - b.length)) + b;
};

export function buildCompactStatementReceiptLines(statement, tenantName) {
  const cuotas = buildCuotaLines(statement.movements);
  const pagos = buildPaymentLines(statement);
  const totals = compactTotals(statement);
  const mora = moraSummary(statement);
  const lines = [
    center((tenantName || "CrediMaster").toUpperCase()),
    center("ESTADO DE CUENTA"),
    divider(),
    statement.customer_name || "",
    ...(statement.customer_code ? [`Codigo: ${statement.customer_code}`] : []),
    `Credito #${statement.credit_code || statement.loan_id || "-"}`,
    `Desembolso: ${fmtDMY(statement.disbursement_date)}`,
    `Interes: ${num(statement.approved_rate || statement.interest_rate)}%  Plazo: ${num(statement.approved_term || statement.term).toFixed(2)}`,
    `Vence: ${fmtDMY(statement.due_date)}`,
    ...(statement.frequency_name ? [`Frecuencia: ${statement.frequency_name}`] : []),
    ...(officerLabel(statement) ? [`Oficial: ${officerLabel(statement)}`] : []),
    `Corte: ${fmtDMY(statement.cut_date) || new Date().toISOString().slice(0, 10)}`,
    divider(),
    ...(mora.count > 0 || mora.days > 0
      ? [
          "EN MORA",
          twoCol("  Dias de mora", String(mora.days)),
          twoCol("  Cuotas en mora", String(mora.count)),
          twoCol("  Monto en mora", fmtAmount(mora.amount)),
        ]
      : ["AL DIA (sin mora)"]),
    divider(),
    twoCol("CUOTAS  Cta Fecha", "Total"),
    divider(),
    ...cuotas.flatMap((c) => [
      twoCol(`${String(c.n).padStart(2)} ${fmtDMYShort(c.due)}`, fmtAmount(c.total)),
      ...(c.movedFrom ? [`   Reprogramada${typeof c.movedFrom === "string" ? `: era ${fmtDMYShort(c.movedFrom)}` : ""}`] : []),
    ]),
    twoCol("TOTAL CUOTAS", fmtAmount(totals.installments)),
    divider(),
    twoCol("PAGOS  Documento Fecha", "Total"),
    divider(),
    ...(pagos.length ? pagos.map((p) => twoCol(`${p.doc.replace(" ", "")} ${fmtDMYShort(p.date)}`, fmtAmount(p.amount))) : ["Sin pagos"]),
    divider(),
    twoCol("PAGO TOTAL", fmtAmount(totals.paid)),
    twoCol("SALDO TOTAL", fmtAmount(totals.balance)),
  ];
  return lines;
}
