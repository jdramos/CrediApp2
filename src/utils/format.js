export function money(n) {
  const x = Number(n ?? 0);
  return x.toLocaleString("es-NI", { style: "currency", currency: "NIO" });
}

export function toNumber(v) {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}

// Da formato de miles a un monto MIENTRAS se escribe: "1500.5" -> "1,500.5".
// Deja solo dígitos y un punto decimal (máx. 2 decimales) y conserva el punto
// final ("1,500.") para poder seguir tecleando los centavos.
export function formatAmountInput(text) {
  const clean = String(text ?? "").replace(/[^\d.]/g, "");
  const dot = clean.indexOf(".");
  const intRaw = dot === -1 ? clean : clean.slice(0, dot);
  const dec = dot === -1 ? null : clean.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  const intPart = intRaw.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec === null ? intPart : `${intPart || "0"}.${dec}`;
}
