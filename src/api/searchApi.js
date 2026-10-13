import { credimasterGet } from "./credimasterClient";

// Búsqueda general (GET /api/search): clientes (nombre, cédula, código,
// teléfono), créditos (número, código, cliente) y pagos (número de pago).
// El backend filtra cada grupo por permiso y por las sucursales del
// usuario. `types` se limita a lo que la app puede abrir (no hay pantallas
// de proveedores ni empleados).
export const globalSearch = (token, query) =>
  credimasterGet(
    `/api/search?q=${encodeURIComponent(query || "")}&types=customer,loan,payment`,
    token,
  );
