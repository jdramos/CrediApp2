export function money(n) {
  const x = Number(n ?? 0);
  return x.toLocaleString("es-NI", { style: "currency", currency: "NIO" });
}

export function toNumber(v) {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
}