// Nombre del cliente con su código al frente ("0123 · MARIA LOPEZ"). El código va
// primero para que no se corte en las listas de una sola línea (numberOfLines).
// Sin código (cliente sin código o servidor sin actualizar) queda solo el nombre.
export const withCode = (name, code, fallback = "Cliente") => {
  const n = String(name || "").trim() || fallback;
  const c = String(code || "").trim();
  return c ? `${c} · ${n}` : n;
};
