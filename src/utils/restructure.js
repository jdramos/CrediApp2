import { parseISODate, todayISODate } from "../components/DateWheelPicker";

// Quién puede pedir una reestructuración desde la app (los dos métodos usan el mismo permiso). Qué pantalla se abre
// depende del método de la empresa: ver RestructureEntryScreen.
export const canRequestRestructure = (session) => !!session?.permissions?.includes("creditos.modificaciones.solicitar");

// Cuánto se suma a la fecha de hoy para sugerir la primera cuota (el usuario la puede cambiar).
const PERIOD = { D: [1, "d"], S: [7, "d"], B: [14, "d"], Q: [15, "d"], M: [1, "m"], BM: [2, "m"], TM: [3, "m"], CM: [4, "m"], SM: [6, "m"], A: [12, "m"], V: [1, "m"] };
const pad = (n) => String(n).padStart(2, "0");
export function suggestFirstPayment(tag) {
  const base = parseISODate(todayISODate());
  const [amount, unit] = PERIOD[tag] || PERIOD.M;
  if (unit === "d") {
    const d = new Date(Date.UTC(base.y, base.m - 1, base.d + amount));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const total = base.m - 1 + amount;
  const y = base.y + Math.floor(total / 12);
  const m = total % 12;
  const day = Math.min(base.d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}
