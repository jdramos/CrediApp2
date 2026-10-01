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

// Mismo contenido que AccountStatementScreen.js, en líneas de texto plano
// para un ticket de 58mm. `tenantName` es el nombre comercial del tenant
// (no "CrediMaster", que es solo el nombre de la plataforma) -- ver
// session.tenant en SessionContext.js.
export function buildAccountStatementReceiptLines(statement, tenantName) {
  const lines = [
    center((tenantName || "CrediMaster").toUpperCase()),
    center(statement.customer_name || ""),
    `Cedula: ${statement.customer_identification || "-"}`,
    `Credito #${statement.credit_code || statement.loan_id || "-"}`,
    `Corte: ${new Date().toISOString().slice(0, 10)}`,
    divider(),
    twoCol("Capital", money(statement.capital_balance)),
    twoCol("Interes", money(statement.interest_balance)),
  ];
  if (Number(statement.insurance_balance || 0) > 0) {
    lines.push(twoCol("Seguro", money(statement.insurance_balance)));
  }
  if (Number(statement.fee_balance || 0) > 0) {
    lines.push(twoCol("Comision", money(statement.fee_balance)));
  }
  lines.push(divider());
  lines.push(twoCol("TOTAL ADEUDADO", money(statement.total_balance)));
  if (Number(statement.defaulted_days || 0) > 0) {
    lines.push("");
    lines.push(`En mora: ${statement.defaulted_days} dias`);
  }
  return lines;
}

// Mismo contenido que el comprobante de PaymentsScreen.js. `tenantName` ver
// comentario de buildAccountStatementReceiptLines arriba.
export function buildPaymentReceiptLines({
  tenantName,
  customerName,
  customerIdentification,
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
