import { credimasterGet } from "./credimasterClient";

// Catálogos del formulario "Nuevo cliente". Todos piden el permiso
// catalogos.ver (lo tienen Oficial de Crédito, Promotor, etc.). Cada uno se
// devuelve ya como lista de { id, label, ... } para CatalogPickerField.
const asList = (res) => (Array.isArray(res) ? res : res?.rows || res?.data || []);

export const getCountries = async (token) =>
  asList(await credimasterGet("/api/countries", token)).map((c) => ({
    id: c.id,
    label: c.name,
    favorite: Number(c.favorite) === 1,
  }));

export const getProvinces = async (token) =>
  asList(await credimasterGet("/api/provinces", token)).map((p) => ({ id: p.id, label: p.name }));

export const getMunicipalities = async (token) =>
  asList(await credimasterGet("/api/municipalities", token)).map((m) => ({
    id: m.id,
    label: m.name,
    province_id: m.province_id,
  }));

export const getGenres = async (token) =>
  asList(await credimasterGet("/api/genres", token)).map((g) => ({ id: g.id, label: g.name }));

export const getMaritalStatuses = async (token) =>
  asList(await credimasterGet("/api/conami/estado-civil?pageSize=200", token)).map((s) => ({
    id: s.id,
    label: s.name,
  }));

export const getDocumentTypes = async (token) =>
  asList(await credimasterGet("/api/conami/tipo-documento", token)).map((t) => ({
    id: t.id,
    label: t.name,
    is_default: Number(t.is_default) === 1,
  }));

export const getBusinessTypes = async (token) =>
  asList(await credimasterGet("/api/businesstypes", token)).map((b) => ({ id: b.id, label: b.name }));

// Actividades económicas CONAMI (lista larga). Las que terminan en "00" son
// títulos de grupo y no se pueden elegir (igual que en la web).
export const getEconomicActivities = async (token) =>
  asList(await credimasterGet("/api/conami/actividad_economica?page=1&pageSize=5000&sortBy=conami_code&sortDir=asc", token))
    .filter((a) => !String(a.conami_code ?? "").endsWith("00"))
    .map((a) => ({ id: a.id, label: `${a.conami_code} - ${a.description}` }));
