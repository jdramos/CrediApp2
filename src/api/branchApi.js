import { credimasterGet } from "./credimasterClient";
import { cachedFetch } from "../offline/cache";

// Sucursales accesibles por el usuario actual — solo requiere sesión
// válida (no un permiso de configuración), pensado justo para alimentar
// selectores como este. Se guarda la última respuesta para usarla sin señal
// (formulario de cliente nuevo, ver offline/cache.js).
export const getAccessibleBranches = async (token) =>
  (await cachedFetch("branches:accessible", () => credimasterGet("/api/branches/accessible", token))).data;
