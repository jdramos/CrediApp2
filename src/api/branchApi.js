import { credimasterGet } from "./credimasterClient";

// Sucursales accesibles por el usuario actual — solo requiere sesión
// válida (no un permiso de configuración), pensado justo para alimentar
// selectores como este.
export const getAccessibleBranches = (token) => credimasterGet("/api/branches/accessible", token);
