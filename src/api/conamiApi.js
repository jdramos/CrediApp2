import { credimasterGet } from "./credimasterClient";

// Catálogos CONAMI para el formulario de crédito (tipo, destino, línea,
// modalidad, moneda, etc.) — permiso catalogos.ver. Respuesta plana (sin
// envoltorio {data}): { tiposCredito: [...], destinosCredito: [...], ... }.
export const getLoanCatalogs = (token) => credimasterGet("/api/conami/catalogs", token);
