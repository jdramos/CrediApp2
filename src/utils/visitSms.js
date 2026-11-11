import { amountText, shortDate, toAscii, SMS_MAX_LENGTH } from "./paymentSms";

// SMS al cliente al registrar una gestión de cobro (dueño, 2026-11-10). Mismo
// límite y mismas reglas que el SMS del pago: <= 120 caracteres, sin tildes,
// y si no cabe va soltando lo menos importante.
//   MANOA: Registramos su compromiso de pago de C$500.00 para el 12/11/26. Cred. 1016. Gracias!
//   MANOA: Le visitamos hoy 10/11/26 por su cred. 1016. Saldo en mora C$1,200.00. Favor ponerse al dia.
const CONTACT_TEXT = {
  VISIT: "Le visitamos hoy",
  CALL: "Le llamamos hoy",
  LETTER: "Le dejamos una notificacion hoy",
};

export function buildShortVisitSms({
  tenantName,
  actionType,
  result,
  actionDate,
  promisedAmount,
  promisedDate,
  overdueAmount,
  loanLabel,
}) {
  const name = (toAscii(tenantName) || "CrediMaster").slice(0, 25).trim();
  const loan = loanLabel != null && loanLabel !== "" ? toAscii(loanLabel) : "";
  const hasPromise = Number(promisedAmount) > 0 && promisedDate;
  const mora = Number(overdueAmount) > 0 ? ` Saldo en mora C$${amountText(overdueAmount)}.` : "";

  let variants;
  if (hasPromise) {
    const base = `Registramos su compromiso de pago de C$${amountText(promisedAmount)} para el ${shortDate(promisedDate)}.`;
    variants = [
      `${base}${loan ? ` Cred. ${loan}.` : ""} Gracias!`,
      `${base} Gracias!`,
      base,
    ];
  } else {
    const lookedFor = result === "NOT_LOCATED" || result === "NO_ANSWER";
    const contact = lookedFor ? "Le buscamos hoy" : CONTACT_TEXT[actionType] || "Nos comunicamos con usted hoy";
    const when = shortDate(actionDate);
    const closing = mora ? " Favor ponerse al dia." : " Gracias!";
    variants = [
      `${contact} ${when} por su cred. ${loan}.${mora}${lookedFor ? " Comuniquese con nosotros." : closing}`,
      `${contact} ${when} por su cred. ${loan}.${mora}`,
      `${contact} ${when}.${mora}`,
    ].map((v) => (loan ? v : v.replace(" por su cred. .", ".")));
  }

  for (const v of variants) {
    const text = `${name}: ${v}`;
    if (text.length <= SMS_MAX_LENGTH) return text;
  }
  const last = variants[variants.length - 1];
  const room = SMS_MAX_LENGTH - last.length - 2;
  return `${name.slice(0, Math.max(room, 4))}: ${last}`.slice(0, SMS_MAX_LENGTH);
}
