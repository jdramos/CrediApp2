import { Alert } from "react-native";
import { money } from "./format";

// Abstracción de impresión térmica Bluetooth (ESC/POS).
//
// Todavía NO está instalada la librería real (@ricka7x/expo-thermal-printer)
// a propósito: agrega código nativo, y eso hace que Expo Go deje de poder
// abrir la app ENTERA (no solo esta pantalla) hasta generar un development
// build real. El botón "Imprimir" ya vive en la UI desde ahora (aunque no
// haya impresora emparejada) para no tener que agregar otra pantalla el día
// que se instale la librería -- ese día, lo único que cambia es el cuerpo
// de printReceipt() acá adentro; el resto de la app (los botones, el
// armado del recibo) queda igual.
export function isPrinterFeatureAvailable() {
  return false;
}

// `lines` es un array de strings, ya formateadas para un ticket angosto de
// 32 caracteres (58mm) -- independiente de qué librería termine
// imprimiéndolas, para no tener que tocar los builders de abajo después.
export async function printReceipt(lines) {
  Alert.alert(
    "Impresora Bluetooth",
    "Esta función todavía no está activa en esta versión de la app — hace falta instalar una actualización nativa primero. Mientras tanto, podés compartir el recibo por WhatsApp u otro medio con el botón de arriba.",
  );
}

const LINE_WIDTH = 32;
const divider = () => "-".repeat(LINE_WIDTH);
const center = (text) => {
  const t = String(text ?? "");
  const pad = Math.max(0, Math.floor((LINE_WIDTH - t.length) / 2));
  return " ".repeat(pad) + t;
};
const twoCol = (left, right) => {
  const l = String(left ?? "");
  const r = String(right ?? "");
  const gap = Math.max(1, LINE_WIDTH - l.length - r.length);
  return l + " ".repeat(gap) + r;
};

// Resumen del estado de cuenta, calculado todo de las cuotas para que
// atrasado + vigente = total adeudado SIEMPRE (antes el total venía del
// snapshot de `balances` y los otros dos de las cuotas: bases distintas, y
// las cuotas futuras traen el interés programado completo, que todavía no
// se ha devengado -- por eso vigente + atrasado superaba al total).
//   - Atrasado: lo pendiente de cuotas vencidas (capital+interés+cargos).
//   - Vigente: capital que aún no vence, más lo pendiente de la cuota
//     parcialmente pagada que sigue vigente. NO incluye el interés de
//     cuotas futuras (no se debe todavía).
export function summarizeMovements(movements) {
  let overdueBalance = 0;
  let currentBalance = 0;
  let overdueSinceDate = null;
  for (const m of Array.isArray(movements) ? movements : []) {
    if (m.status === "OVERDUE") {
      overdueBalance += Number(m.pending_total || 0);
      if (!overdueSinceDate || String(m.payment_date) < String(overdueSinceDate)) {
        overdueSinceDate = m.payment_date;
      }
    } else if (m.status === "PARTIAL") {
      currentBalance += Number(m.pending_total || 0);
    } else if (m.status === "CURRENT") {
      currentBalance += Number(m.pending_principal || 0);
    }
  }
  return {
    overdueBalance,
    currentBalance,
    totalBalance: overdueBalance + currentBalance,
    overdueSinceDate,
  };
}

// Mismo contenido que AccountStatementScreen.js, en líneas de texto plano
// para un ticket de 58mm. `tenantName` es el nombre comercial del tenant
// (no "CrediMaster", que es solo el nombre de la plataforma) -- ver
// session.tenant en SessionContext.js.
export function buildAccountStatementReceiptLines(statement, tenantName) {
  const { overdueBalance, currentBalance, totalBalance, overdueSinceDate } = summarizeMovements(statement.movements);
  const lines = [
    center((tenantName || "CrediMaster").toUpperCase()),
    center(statement.customer_name || ""),
    `Cedula: ${statement.customer_identification || "-"}`,
    ...(statement.customer_home_address ? [`Casa: ${statement.customer_home_address}`] : []),
    ...(statement.customer_business_address ? [`Negocio: ${statement.customer_business_address}`] : []),
    `Credito #${statement.credit_code || statement.loan_id || "-"}`,
    `Corte: ${new Date().toISOString().slice(0, 10)}`,
    divider(),
    twoCol("Saldo atrasado", money(overdueBalance)),
    twoCol("Saldo vigente", money(currentBalance)),
    divider(),
    twoCol("TOTAL ADEUDADO", money(totalBalance)),
  ];
  if (overdueSinceDate) {
    lines.push("");
    lines.push(`En mora desde: ${String(overdueSinceDate).slice(0, 10)}`);
  }
  return lines;
}

// Mismo contenido que el comprobante de PaymentsScreen.js. `tenantName` ver
// comentario de buildAccountStatementReceiptLines arriba.
export function buildPaymentReceiptLines({
  tenantName,
  customerName,
  customerIdentification,
  customerHomeAddress,
  customerBusinessAddress,
  loanLabel,
  date,
  collectorName,
  amount,
  breakdownRows,
  principalBalanceBefore,
  principalBalanceAfter,
  newBalance,
}) {
  const lines = [
    center((tenantName || "CrediMaster").toUpperCase()),
    center("COMPROBANTE DE PAGO"),
    divider(),
    customerName || "",
  ];
  if (customerIdentification) lines.push(`Cedula: ${customerIdentification}`);
  if (customerHomeAddress) lines.push(`Casa: ${customerHomeAddress}`);
  if (customerBusinessAddress) lines.push(`Negocio: ${customerBusinessAddress}`);
  lines.push(`Credito #${loanLabel || "-"}`);
  lines.push(`Fecha: ${date || ""}`);
  if (collectorName) lines.push(`Cobrado por: ${collectorName}`);
  lines.push(divider());
  lines.push(twoCol("Monto pagado", money(amount)));
  (breakdownRows || []).forEach((r) => lines.push(twoCol(r.label, money(r.value))));
  if (principalBalanceBefore != null) {
    lines.push(divider());
    lines.push(twoCol("Saldo capital anterior", money(principalBalanceBefore)));
    lines.push(twoCol("Saldo capital nuevo", money(principalBalanceAfter)));
  }
  if (newBalance != null) {
    lines.push(divider());
    lines.push(twoCol("Nuevo saldo total", money(newBalance)));
  }
  return lines;
}
