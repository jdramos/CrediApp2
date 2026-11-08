import { Alert, PermissionsAndroid, Platform, ToastAndroid } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { money } from "./format";
import { buildEscPos, TEST_LINES } from "./escpos";
import { bytesToBase64 } from "./pdfBuilder";
import {
  isBluetoothPrintAvailable,
  hasBluetoothPermission,
  isBluetoothOn,
  getPairedDevices as nativePairedDevices,
  sendBytes,
} from "../../modules/credimaster-printer";

// Impresión térmica por Bluetooth (ESC/POS, 58 mm).
//
// La impresora se empareja UNA vez en los ajustes de Bluetooth del teléfono; en la
// app se elige en Más > Impresora Bluetooth (o la primera vez que se toca
// "Imprimir") y queda guardada. Después, "Imprimir" conecta, manda el recibo y cierra.
// El módulo nativo (modules/credimaster-printer) solo existe en el APK de Android;
// en la web / Expo Go / iOS esto avisa que no está disponible.
const PRINTER_KEY = "APP_PRINTER_V1";

export const isPrinterFeatureAvailable = () => isBluetoothPrintAvailable();

// { address, name, accents } de la impresora guardada, o null.
export async function getSavedPrinter() {
  try {
    const raw = await AsyncStorage.getItem(PRINTER_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p?.address ? { address: p.address, name: p.name || p.address, accents: !!p.accents } : null;
  } catch {
    return null;
  }
}

export async function savePrinter(printer) {
  await AsyncStorage.setItem(
    PRINTER_KEY,
    JSON.stringify({ address: printer.address, name: printer.name, accents: !!printer.accents }),
  );
}

export async function forgetPrinter() {
  await AsyncStorage.removeItem(PRINTER_KEY);
}

// Dispositivos Bluetooth ya emparejados en el teléfono (las impresoras primero).
export function getPairedPrinters() {
  return [...nativePairedDevices()].sort((a, b) => Number(b.isPrinter) - Number(a.isPrinter) || String(a.name).localeCompare(String(b.name)));
}

// Pide el permiso de Bluetooth (Android 12+) y comprueba que esté encendido.
export async function ensureBluetoothReady() {
  if (!isBluetoothPrintAvailable()) {
    throw Object.assign(new Error("Este teléfono no puede imprimir por Bluetooth desde la app."), { code: "ERR_UNAVAILABLE" });
  }
  if (Platform.OS === "android" && Platform.Version >= 31 && !hasBluetoothPermission()) {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, {
      title: "Permiso de Bluetooth",
      message: "CrediApp necesita el permiso de Bluetooth para conectarse a la impresora de recibos.",
      buttonPositive: "Permitir",
      buttonNegative: "Ahora no",
    });
    if (res !== PermissionsAndroid.RESULTS.GRANTED) {
      throw Object.assign(new Error("Sin el permiso de Bluetooth no se puede imprimir. Actívelo en los ajustes de la app."), { code: "ERR_NO_PERMISSION" });
    }
  }
  if (!isBluetoothOn()) {
    throw Object.assign(new Error("El Bluetooth del teléfono está apagado. Enciéndalo e intente de nuevo."), { code: "ERR_BT_OFF" });
  }
}

// Quién muestra el selector de impresora (PrinterHost, montado en App.js).
let pickerHost = null;
export const setPrinterPickerHost = (fn) => {
  pickerHost = fn;
};
// Abre el selector; resuelve con { address, name, accents } o null si lo cierran.
export function openPrinterPicker() {
  return pickerHost ? pickerHost() : Promise.resolve(null);
}

// Manda los bytes del ticket a la impresora indicada.
async function sendTicket(printer, lines) {
  const bytes = buildEscPos(lines, { accents: !!printer.accents });
  await sendBytes(printer.address, bytesToBase64(bytes));
}

const PRINT_ERROR_TITLES = {
  ERR_CONNECT: "No se pudo conectar con la impresora",
  ERR_NOT_FOUND: "Impresora no encontrada",
};

// Imprime un ticket de prueba con la impresora dada (o la guardada).
export async function printTestTicket(printer) {
  await ensureBluetoothReady();
  const target = printer || (await getSavedPrinter());
  if (!target) throw new Error("Primero elija una impresora.");
  await sendTicket(target, TEST_LINES);
}

// `lines` es un array de strings, ya formateadas para un ticket angosto de
// 32 caracteres (58mm) -- independiente de qué librería termine
// imprimiéndolas, para no tener que tocar los builders de abajo después.
// Devuelve true si se mandó a la impresora. Todos los errores se muestran aquí
// (los botones de imprimir no esperan el resultado).
export async function printReceipt(lines) {
  if (!isBluetoothPrintAvailable()) {
    Alert.alert(
      "Impresora Bluetooth",
      Platform.OS === "android"
        ? "Esta versión de la app no trae la impresión por Bluetooth. Instale la versión más reciente de CrediApp."
        : "La impresión por Bluetooth solo está disponible en la app de Android. Mientras tanto, puede compartir el recibo por WhatsApp u otro medio con el botón de compartir.",
    );
    return false;
  }
  try {
    await ensureBluetoothReady();
    let printer = await getSavedPrinter();
    if (!printer) {
      printer = await openPrinterPicker();
      if (!printer) return false;
    }
    await sendTicket(printer, lines);
    if (Platform.OS === "android") ToastAndroid.show("Enviado a la impresora", ToastAndroid.SHORT);
    return true;
  } catch (e) {
    const code = e?.code;
    const title = PRINT_ERROR_TITLES[code] || "No se pudo imprimir";
    const canChange = code === "ERR_CONNECT" || code === "ERR_NOT_FOUND";
    Alert.alert(title, e?.message || "Intente de nuevo.", [
      ...(canChange
        ? [{ text: "Elegir otra impresora", onPress: () => { openPrinterPicker(); } }]
        : []),
      { text: "Cerrar", style: "cancel" },
    ]);
    return false;
  }
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
//     cuotas futuras (no se debe todavía), salvo en un crédito flat
//     (`flatPlan`): ahí el interés es fijo y el saldo es todo lo que falta
//     según el plan (dueño, 2026-11-02).
export function summarizeMovements(movements, flatPlan = false) {
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
      currentBalance += Number((flatPlan ? m.pending_total : m.pending_principal) || 0);
    }
  }
  return {
    overdueBalance,
    currentBalance,
    totalBalance: overdueBalance + currentBalance,
    overdueSinceDate,
  };
}

// Saldo inicial del crédito, con la misma convención que el saldo actual: en
// un crédito flat es todo lo que se debía según el plan (capital + interés +
// cargos de todas las cuotas); sobre saldo, el monto desembolsado (el interés
// se va devengando después). 0 si el servidor no manda los datos.
export function initialBalanceOf(statement) {
  if (!statement) return 0;
  if (statement.is_flat_plan) {
    return (
      Number(statement.scheduled_principal || 0) +
      Number(statement.scheduled_interest || 0) +
      Number(statement.scheduled_insurance || 0) +
      Number(statement.scheduled_fee || 0) +
      Number(statement.scheduled_other_charges || 0)
    );
  }
  return Number(statement.approved_amount || statement.amount || 0);
}

// Mismo contenido que AccountStatementScreen.js, en líneas de texto plano
// para un ticket de 58mm. `tenantName` es el nombre comercial del tenant
// (no "CrediMaster", que es solo el nombre de la plataforma) -- ver
// session.tenant en SessionContext.js.
export function buildAccountStatementReceiptLines(statement, tenantName) {
  const { overdueBalance, currentBalance, totalBalance, overdueSinceDate } = summarizeMovements(statement.movements, !!statement.is_flat_plan);
  const initialBalance = initialBalanceOf(statement);
  const summaryLines = [
    ...(initialBalance > 0 ? [twoCol("Saldo inicial", money(initialBalance))] : []),
    ...(statement.total_paid != null ? [twoCol("Total pagado", money(statement.total_paid))] : []),
    twoCol("SALDO ACTUAL", money(totalBalance)),
    twoCol("  atrasado", money(overdueBalance)),
    twoCol("  vigente", money(currentBalance)),
  ];
  const lines = [
    center((tenantName || "CrediMaster").toUpperCase()),
    center(statement.customer_name || ""),
    ...(statement.customer_code ? [`Codigo: ${statement.customer_code}`] : []),
    `Cedula: ${statement.customer_identification || "-"}`,
    ...(statement.customer_home_address ? [`Casa: ${statement.customer_home_address}`] : []),
    ...(statement.customer_business_address ? [`Negocio: ${statement.customer_business_address}`] : []),
    `Credito #${statement.credit_code || statement.loan_id || "-"}`,
    `Corte: ${new Date().toISOString().slice(0, 10)}`,
    divider(),
    ...summaryLines,
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
  customerCode,
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
  receiptNumber,
  usd,
  flat = false,
  totalBefore,
  installmentDetail = [],
}) {
  const lines = [
    center((tenantName || "CrediMaster").toUpperCase()),
    center("COMPROBANTE DE PAGO"),
    ...(receiptNumber ? [center(`Recibo No. ${receiptNumber}`)] : []),
    divider(),
    customerName || "",
  ];
  if (customerCode) lines.push(`Codigo: ${customerCode}`);
  if (customerIdentification) lines.push(`Cedula: ${customerIdentification}`);
  if (customerHomeAddress) lines.push(`Casa: ${customerHomeAddress}`);
  if (customerBusinessAddress) lines.push(`Negocio: ${customerBusinessAddress}`);
  lines.push(`Credito #${loanLabel || "-"}`);
  lines.push(`Fecha: ${date || ""}`);
  if (collectorName) lines.push(`Cobrado por: ${collectorName}`);
  lines.push(divider());
  if (flat && totalBefore != null) lines.push(twoCol("Saldo total anterior", money(totalBefore)));
  lines.push(twoCol("Pago recibido", money(amount)));
  if ((installmentDetail || []).length) {
    lines.push(divider());
    lines.push("Cuotas cubiertas por este pago:");
    installmentDetail.forEach((d) => {
      lines.push(`  Cuota ${d.key}: ${money(d.amount)}`);
      lines.push(`    ${d.status}${d.paid ? "" : `, la cuota es de ${money(d.scheduled)}`}`);
    });
    lines.push(divider());
  }
  if (usd) {
    lines.push(`Recibido: US$ ${Number(usd.foreign_amount).toFixed(2)}`);
    lines.push(`TC de compra: C$ ${Number(usd.fx_rate).toFixed(2)}`);
  }
  (breakdownRows || []).forEach((r) => lines.push(twoCol(r.label, money(r.value))));
  if (!flat && principalBalanceBefore != null) {
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
