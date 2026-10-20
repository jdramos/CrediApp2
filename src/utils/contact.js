import { Alert, Linking, Platform } from "react-native";
import { money } from "./format";

// País por defecto para los números de 8 dígitos (Nicaragua). WhatsApp necesita
// el número en formato internacional sin "+".
const DEFAULT_COUNTRY_CODE = "505";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "2026-10-30" (o con hora) -> "30 de octubre".
export function longDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]}`;
}

// Celular primero y, si no hay, el teléfono fijo.
export const phoneOf = (c) => c?.cellphone || c?.telephone || "";

const firstName = (full) => String(full || "").trim().split(/\s+/)[0] || "";

// Texto del SMS/WhatsApp con el pago que acaba de recibir el cliente.
export function buildPaymentMessage({ tenantName, amount, date, loanLabel, principal, interest, principalAfter, receiptNumber }) {
  const parts = [
    `${tenantName || "CrediMaster"}: recibimos su pago de ${money(amount)} el ${date} al crédito #${loanLabel}${receiptNumber ? ` (recibo ${receiptNumber})` : ""}.`,
  ];
  if (principal != null || interest != null) {
    parts.push(`Aplicado a capital ${money(Number(principal) || 0)} y a interés ${money(Number(interest) || 0)}.`);
  }
  if (principalAfter != null) parts.push(`Saldo capital: ${money(principalAfter)}.`);
  parts.push("¡Gracias!");
  return parts.join(" ");
}

// Recordatorio de cobro: si tiene cuotas vencidas se las recuerda; si está al
// día, avisa de la próxima cuota.
export function buildReminderMessage({ tenantName, customerName, loanLabel, overdueInstallments, overdueAmount, daysOverdue, nextAmount, nextDate }) {
  const name = firstName(customerName);
  const hello = `${tenantName || "CrediMaster"}: Estimado(a)${name ? ` ${name}` : ""},`;
  const n = Number(overdueInstallments) || 0;
  if (n > 0) {
    const days = Number(daysOverdue) > 0 ? ` (${daysOverdue} días de atraso)` : "";
    return `${hello} su crédito #${loanLabel} tiene ${n} cuota${n === 1 ? "" : "s"} vencida${n === 1 ? "" : "s"} por ${money(overdueAmount)}${days}. Le agradecemos ponerse al día. ¡Gracias!`;
  }
  if (Number(nextAmount) > 0) {
    const when = nextDate ? ` y vence el ${longDate(nextDate)}` : "";
    return `${hello} le recordamos que la próxima cuota de su crédito #${loanLabel} es de ${money(nextAmount)}${when}. ¡Gracias!`;
  }
  return `${hello} le saludamos por su crédito #${loanLabel}. ¡Gracias por su puntualidad!`;
}

function noPhone() {
  Alert.alert("Sin teléfono", "Este cliente no tiene un número de teléfono registrado.");
}

// Abre la app de mensajes con el texto listo (se envía con el plan del
// teléfono del cobrador). En el navegador de escritorio no hay app de SMS.
export async function openSms(phone, body) {
  const to = String(phone || "").replace(/[^\d+]/g, "");
  if (!to) return noPhone();
  try {
    await Linking.openURL(`sms:${to}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`);
  } catch {
    Alert.alert("No se pudo abrir los mensajes", "Este dispositivo no puede enviar SMS desde la app.");
  }
}

// Abre WhatsApp en la conversación con el cliente, con el texto ya escrito.
export async function openWhatsApp(phone, body) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return noPhone();
  if (digits.length === 8) digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  try {
    await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(body)}`);
  } catch {
    Alert.alert("No se pudo abrir WhatsApp", "Verificá que WhatsApp esté instalado en este dispositivo.");
  }
}

export async function callPhone(phone) {
  const to = String(phone || "").replace(/[^\d+]/g, "");
  if (!to) return noPhone();
  try {
    await Linking.openURL(`tel:${to}`);
  } catch {
    Alert.alert("No se pudo llamar", "Este dispositivo no puede hacer llamadas desde la app.");
  }
}
