// Mismas opciones y mismos códigos que CollectionsWorklist.jsx (web), para
// que una gestión registrada desde el celular se vea igual en la bitácora
// de los dos lados.
export const ACTION_TYPES = [
  ["CALL", "Llamada"],
  ["VISIT", "Visita"],
  ["WHATSAPP", "WhatsApp"],
  ["MESSAGE", "Mensaje/SMS"],
  ["EMAIL", "Correo"],
  ["LETTER", "Carta/Notificación"],
  ["OTHER", "Otro"],
];

export const RESULTS = [
  ["CONTACTED", "Contactado"],
  ["PROMISE", "Promesa de pago"],
  ["PARTIAL_PAYMENT", "Pago parcial"],
  ["NO_ANSWER", "No contesta"],
  ["NOT_LOCATED", "No localizado"],
  ["REFUSED", "Se niega a pagar"],
  ["OTHER", "Otro"],
];

export const STAGES = [
  ["PREVENTIVE", "Preventiva"],
  ["ADMINISTRATIVE", "Administrativa"],
  ["LEGAL", "Judicial"],
];

const labelOf = (list, code) => list.find(([c]) => c === code)?.[1] || code || "";
export const actionTypeLabel = (code) => labelOf(ACTION_TYPES, code);
export const resultLabel = (code) => labelOf(RESULTS, code);
export const stageLabel = (code) => labelOf(STAGES, code);
