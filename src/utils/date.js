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
