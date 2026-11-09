import { credimasterGet } from "./credimasterClient";
import { cachedFetch } from "../offline/cache";

// Catálogos del formulario "Nuevo cliente". Todos piden el permiso
// catalogos.ver (lo tienen Oficial de Crédito, Promotor, etc.). Cada uno se
// devuelve ya como lista de { id, label, ... } para CatalogPickerField.
const asList = (res) => (Array.isArray(res) ? res : res?.rows || res?.data || []);

// Los catálogos casi no cambian: la última respuesta se guarda para poder llenar el formulario
// de un cliente nuevo sin señal (offline/cache.js; se borra al cerrar sesión). La clave no lleva
// usuario porque son catálogos de la empresa y la copia se borra al salir.
const cached = async (key, fetcher) => (await cachedFetch(`catalog:${key}`, fetcher)).data;

export const getCountries = (token) =>
  cached("countries", async () =>
    asList(await credimasterGet("/api/countries", token)).map((c) => ({
      id: c.id,
      label: c.name,
      favorite: Number(c.favorite) === 1,
    })),
  );

export const getProvinces = (token) =>
  cached("provinces", async () =>
    asList(await credimasterGet("/api/provinces", token)).map((p) => ({ id: p.id, label: p.name })),
  );

export const getMunicipalities = (token) =>
  cached("municipalities", async () =>
    asList(await credimasterGet("/api/municipalities", token)).map((m) => ({
      id: m.id,
      label: m.name,
      province_id: m.province_id,
    })),
  );

export const getGenres = (token) =>
  cached("genres", async () =>
    asList(await credimasterGet("/api/genres", token)).map((g) => ({ id: g.id, label: g.name })),
  );

export const getMaritalStatuses = (token) =>
  cached("marital", async () =>
    asList(await credimasterGet("/api/conami/estado-civil?pageSize=200", token)).map((s) => ({
      id: s.id,
      label: s.name,
    })),
  );

export const getDocumentTypes = (token) =>
  cached("docTypes", async () =>
    asList(await credimasterGet("/api/conami/tipo-documento", token)).map((t) => ({
      id: t.id,
      label: t.name,
      is_default: Number(t.is_default) === 1,
    })),
  );

export const getBusinessTypes = (token) =>
  cached("businessTypes", async () =>
    asList(await credimasterGet("/api/businesstypes", token)).map((b) => ({ id: b.id, label: b.name })),
  );

// Actividades económicas CONAMI (lista larga). Las que terminan en "00" son
// títulos de grupo y no se pueden elegir (igual que en la web).
export const getEconomicActivities = (token) =>
  cached("activities", async () =>
    asList(await credimasterGet("/api/conami/actividad_economica?page=1&pageSize=5000&sortBy=conami_code&sortDir=asc", token))
      .filter((a) => !String(a.conami_code ?? "").endsWith("00"))
      .map((a) => ({ id: a.id, label: `${a.conami_code} - ${a.description}` })),
  );

// Descarga (y guarda) los catálogos del formulario de cliente nuevo para tenerlos sin señal.
// Best-effort: se llama al tener conexión; si algo falla (sin permiso, sin red) no pasa nada.
export async function prefetchCustomerCatalogs(token) {
  await Promise.allSettled([
    getCountries(token),
    getProvinces(token),
    getMunicipalities(token),
    getGenres(token),
    getMaritalStatuses(token),
    getDocumentTypes(token),
    getBusinessTypes(token),
    getEconomicActivities(token),
  ]);
}
