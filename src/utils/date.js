export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Mueve una fecha YYYY-MM-DD por días sin pasar por zonas horarias (mediodía
// local evita que el cambio de horario o UTC corra el día).
export function shiftDay(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta, 12, 0, 0);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Períodos rápidos (Hoy, Ayer, Semana de lunes a hoy, Mes, Mes anterior) como
// { from, to } en YYYY-MM-DD, con la fecha local del teléfono.
export function periodRange(key) {
  const today = todayISO();
  const [y, m, d] = today.split("-").map(Number);
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  switch (key) {
    case "yesterday": {
      const day = shiftDay(today, -1);
      return { from: day, to: day };
    }
    case "week": {
      const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = domingo
      return { from: shiftDay(today, -((dow + 6) % 7)), to: today };
    }
    case "month":
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
    case "prevMonth":
      return { from: iso(new Date(y, m - 2, 1, 12)), to: iso(new Date(y, m - 1, 0, 12)) };
    default:
      return { from: today, to: today };
  }
}
