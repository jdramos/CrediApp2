import { credimasterGet } from "./credimasterClient";
import { cachedFetch } from "../offline/cache";

// Catálogos CONAMI para el formulario de crédito (tipo, destino, línea,
// modalidad, moneda, etc.) — permiso catalogos.ver. Respuesta plana (sin
// envoltorio {data}): { tiposCredito: [...], destinosCredito: [...], ... }.
// Se guarda la última respuesta para poder armar una solicitud sin señal (offline/cache.js).
export const getLoanCatalogs = async (token) =>
  (await cachedFetch("loanform:catalogs", () => credimasterGet("/api/conami/catalogs", token))).data;
