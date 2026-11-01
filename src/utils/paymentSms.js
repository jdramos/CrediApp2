import { PermissionsAndroid, Platform } from "react-native";
import { hasSendSmsPermission, isSilentSmsAvailable, sendSmsSilently } from "../../modules/credimaster-sms";
import { getNoticePolicy, reportPaymentNotice } from "../api/paymentNoticeApi";

export const SMS_MAX_LENGTH = 120;

// Solo caracteres básicos del alfabeto GSM: una tilde o una ñ pasa el mensaje de
// 160 a 70 caracteres por SMS (más costo en el plan del cobrador).
const toAscii = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const amountText = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "2026-11-01" -> "01/11/26"
const shortDate = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : toAscii(iso);
};

// SMS corto con el pago y el saldo. Nunca pasa de SMS_MAX_LENGTH: si no cabe, va
// soltando lo menos importante (número de crédito, "Gracias", palabras) y por
// último acorta el nombre de la empresa.
//   MANOA: Pago C$1,250.00 recibido 01/11/26. Saldo capital: C$8,750.00. Cred. 1016. Gracias!
export function buildShortPaymentSms({ tenantName, amount, date, principalAfter, loanLabel }) {
  // El nombre largo se corta a 25 para que quepan el pago y el saldo.
  const name = (toAscii(tenantName) || "CrediMaster").slice(0, 25).trim();
  const saldo = (label) => (principalAfter != null ? ` ${label}: C$${amountText(principalAfter)}.` : "");
  const cred = loanLabel != null && loanLabel !== "" ? ` Cred. ${toAscii(loanLabel)}.` : "";
  const build = (n, { label, withCred, thanks }) =>
    `${n}: Pago C$${amountText(amount)} recibido ${shortDate(date)}.${saldo(label)}${withCred ? cred : ""}${thanks ? " Gracias!" : ""}`;

  const variants = [
    { label: "Saldo capital", withCred: true, thanks: true },
    { label: "Saldo capital", withCred: false, thanks: true },
    { label: "Saldo capital", withCred: false, thanks: false },
    { label: "Saldo", withCred: false, thanks: false },
  ];
  for (const v of variants) {
    const text = build(name, v);
    if (text.length <= SMS_MAX_LENGTH) return text;
  }
  const last = variants[variants.length - 1];
  const overflow = build(name, last).length - SMS_MAX_LENGTH;
  return build(name.slice(0, Math.max(name.length - overflow, 4)), last).slice(0, SMS_MAX_LENGTH);
}

const askSendSmsPermission = async () => {
  if (hasSendSmsPermission()) return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS, {
    title: "Enviar SMS a los clientes",
    message: "CrediApp enviará al cliente un SMS con su pago y saldo, con el plan de este teléfono.",
    buttonPositive: "Permitir",
    buttonNegative: "Ahora no",
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
};

// Envía el SMS de confirmación del pago, solo, desde el celular del cobrador, y
// reporta el resultado a la oficina. NUNCA lanza: el pago ya está grabado.
// Devuelve { state: "sent" | "failed" | "disabled" | "unavailable", error? }.
export async function sendAutoPaymentSms({ token, phone, message, paymentId, loanId }) {
  const report = (status, error) =>
    reportPaymentNotice(token, {
      kind: "PAYMENT",
      channel: "AUTO_SMS",
      status,
      payment_id: paymentId,
      loan_id: loanId,
      phone_to: phone || undefined,
      message,
      error,
    }).catch(() => {});

  try {
    // Sin conexión con la política se asume encendida: el pago ya se grabó en línea.
    const policy = await getNoticePolicy(token).catch(() => null);
    if (policy && policy.auto_sms === false) return { state: "disabled" };

    // En la web (pruebas) no hay chip: el aviso queda para el botón manual.
    if (Platform.OS === "web") return { state: "unavailable" };

    if (!phone) {
      const error = "El cliente no tiene teléfono registrado";
      await report("NO_PHONE", error);
      return { state: "failed", error };
    }
    if (!isSilentSmsAvailable()) {
      const error = "Este teléfono no puede enviar SMS desde la app (usá el botón SMS al cliente)";
      await report("FAILED", error);
      return { state: "failed", error };
    }
    if (!(await askSendSmsPermission())) {
      const error = "No se dio el permiso para enviar SMS";
      await report("FAILED", error);
      return { state: "failed", error };
    }
    await sendSmsSilently(phone.replace(/[^\d+]/g, ""), message);
    await report("SENT");
    return { state: "sent" };
  } catch (e) {
    const error = e?.message || "No se pudo enviar el SMS";
    await report("FAILED", error);
    return { state: "failed", error };
  }
}
