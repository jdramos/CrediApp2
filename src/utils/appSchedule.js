// Horario de uso de la app (se configura en la web: Usuarios → Horario de uso de la
// app). El servidor es quien manda (responde 403 OUTSIDE_SCHEDULE fuera de horario);
// aquí se repite la regla para avisar al usuario en el momento justo, también sin
// señal. Espejo de utils/appSchedule.js del backend. Nicaragua es UTC-6 todo el año.
const MANAGUA_OFFSET_MS = -6 * 3600 * 1000;
const DAY_NAMES = { 1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes", 6: "sábado", 7: "domingo" };

const toSeconds = (value) => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
};

// windows: [{ day (1 = lunes ... 7 = domingo), start: "07:00", end: "18:00" }]
export function evaluateSchedule(windows, nowMs = Date.now()) {
  const list = (windows || []).filter((w) => toSeconds(w.start) !== null && toSeconds(w.end) !== null);
  if (!list.length) return { restricted: false, allowed: true, today: null, next: null };

  const d = new Date(nowMs + MANAGUA_OFFSET_MS);
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const seconds = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  const today = list.find((w) => w.day === day) || null;
  const allowed = !!today && seconds >= toSeconds(today.start) && seconds < toSeconds(today.end);

  let next = null;
  if (!allowed) {
    if (today && seconds < toSeconds(today.start)) next = { day, day_name: DAY_NAMES[day], start: today.start, is_today: true };
    else {
      for (let i = 1; i <= 7 && !next; i += 1) {
        const nd = ((day - 1 + i) % 7) + 1;
        const w = list.find((x) => x.day === nd);
        if (w) next = { day: nd, day_name: DAY_NAMES[nd], start: w.start, is_today: false };
      }
    }
  }
  return { restricted: true, allowed, today, next };
}

export function outsideMessage(status) {
  const base = status.today
    ? `Estás fuera de tu horario de uso de la app (hoy de ${status.today.start} a ${status.today.end}).`
    : "Hoy no tenés acceso a la app según tu horario.";
  if (!status.next) return base;
  return `${base} Podés volver a usarla ${status.next.is_today ? "hoy" : `el ${status.next.day_name}`} a las ${status.next.start}.`;
}
