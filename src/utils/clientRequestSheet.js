// «Solicitud de crédito nuevo» (hoja de papel de JELDER, 2026-11-15): un solo formulario con los datos personales, del negocio
// y del préstamo de un cliente que todavía no existe. Se llena todo, se envía a aprobación y el cliente solo queda guardado
// si la solicitud se aprueba (cliente prospecto, política cliente_nuevo_prospecto; ver utils/prospects.js del servidor).
//
// Sin React ni red, para poder probarlo aparte. La pantalla es screens/ClientRequestSheetScreen.js.
import {
  EMPTY_FORM, CEDULA_TYPE_ID, FIELD_INFO, validateForm, buildCustomerPayload, birthFromCedula, ageFromBirth, normalizeCedula,
} from "./customerForm";

// Política de crédito (por empresa) que enciende esta solicitud en la app. Apagada = todo sigue como siempre.
export const SHEET_POLICY_KEY = "solicitud_cliente_nuevo_hoja";
export const isSheetEnabled = (policies) =>
  ["true", "1", "si", "sí"].includes(String(policies?.[SHEET_POLICY_KEY] ?? "").trim().toLowerCase());

// Campos personalizados de la empresa (Configuración → Campos personalizados) que usa la hoja y que la ficha no tiene.
export const YEARS_LIVING_KEY = "anios_vivir";
export const HOUSING_KEY = "vivienda";
export const EXPERIENCE_KEY = "experiencia_negocio";
export const HOUSING_OPTIONS = ["Casa propia", "Familia", "Alquilada"];

export const EMPTY_SHEET = {
  rate: "",
  customer_name: "",
  identification: "",
  cellphone: "",
  genre_id: null,
  marital_status_id: null,
  occupation: "",
  home_address: "",
  business_address: "",
  years_living: "",
  housing: null,
  business_type_id: null,
  experience: "",
  other_incomes: "",
  credit_sales: "",
  cash_sales: "",
  business_inventory: "",
  cash_amount: "",
  business_receivables: "",
  amount: "",
  term: "",
  frequencyId: null,
  reference_name: "",
  reference_telephone: "",
  reference_relationship: "",
};

const isEmpty = (v) => v === null || v === undefined || String(v).trim() === "";
const toNum = (v) => {
  if (isEmpty(v)) return NaN;
  return Number(String(v).replace(/,/g, ""));
};

// Etiquetas de la hoja por campo (para los mensajes de error).
export const SHEET_LABELS = {
  rate: "Tasa de interés (%)",
  customer_name: "Nombre y apellido",
  identification: "Número de cédula",
  cellphone: "Teléfono",
  genre_id: "Sexo",
  marital_status_id: "Estado civil",
  occupation: "Oficio",
  home_address: "Dirección del domicilio",
  business_address: "Dirección del negocio",
  years_living: "Años de vivir",
  housing: "Vivienda",
  business_type_id: "Tipo de negocio",
  experience: "Experiencia",
  other_incomes: "Otros ingresos",
  credit_sales: "Venta a crédito (%)",
  cash_sales: "Venta de contado (%)",
  business_inventory: "Inventario",
  cash_amount: "Efectivo",
  business_receivables: "Cuentas por cobrar",
  amount: "Monto solicitado",
  term: "Plazo solicitado",
  frequencyId: "Frecuencia de pago",
  reference_name: "Referencia: nombre",
  reference_telephone: "Referencia: teléfono",
  reference_relationship: "Referencia: parentesco",
};

// Todo se llena (la hoja es una solicitud completa de cliente nuevo). Los montos del negocio pueden ser 0 pero no quedar vacíos.
export const SHEET_REQUIRED = Object.keys(SHEET_LABELS);

// Campos de la ficha que se derivan de la cédula y del país de la empresa; la hoja no los pregunta.
export function derivedFromCedula(identification) {
  const birth = birthFromCedula(identification);
  return { birth_date: birth, age: birth ? ageFromBirth(birth) : "" };
}

// Formulario de cliente (el mismo de «Nuevo cliente») armado con lo que se llenó en la hoja.
// ctx: { countryId } = id de Nicaragua en el catálogo de países.
export function customerFormFromSheet(sheet, ctx = {}) {
  const identification = normalizeCedula(sheet.identification);
  const { birth_date, age } = derivedFromCedula(identification);
  return {
    ...EMPTY_FORM,
    customer_name: String(sheet.customer_name || "").trim(),
    identity_type: CEDULA_TYPE_ID,
    identification,
    birth_date,
    age,
    genre_id: sheet.genre_id,
    marital_status_id: sheet.marital_status_id,
    birth_country_id: ctx.countryId ?? null,
    nationality_id: ctx.countryId ?? null,
    residence_country_id: ctx.countryId ?? null,
    identity_issue_country: ctx.countryId ?? null,
    cellphone: sheet.cellphone,
    home_address: sheet.home_address,
    economic_activity: 1, // negocio propio: la hoja habla del negocio del cliente
    occupation: sheet.occupation,
    business_type_id: sheet.business_type_id,
    business_address: sheet.business_address,
    business_inventory: sheet.business_inventory,
    business_receivables: sheet.business_receivables,
    other_incomes: sheet.other_incomes,
    reference_name: sheet.reference_name,
    reference_telephone: sheet.reference_telephone,
    reference_relationship: sheet.reference_relationship,
  };
}

// Errores { campoDeLaHoja: mensaje } de lo que falta o está mal. opts: { regulated, compliance } como en «Nuevo cliente».
// customFields: definiciones de la empresa; si no existen (Años de vivir, Vivienda, Experiencia) la hoja no puede guardarlos.
export function validateSheet(sheet, ctx = {}, opts = {}) {
  const errors = {};

  for (const field of SHEET_REQUIRED) {
    if (isEmpty(sheet[field])) errors[field] = "Campo requerido";
  }

  // Reglas del formulario de cliente (cédula con su formato y fecha de nacimiento, montos, etc.).
  const form = customerFormFromSheet(sheet, ctx);
  const found = validateForm(form, opts);
  const MAP = { customer_name: "customer_name", identification: "identification", genre_id: "genre_id", marital_status_id: "marital_status_id", cellphone: "cellphone", home_address: "home_address", business_address: "business_address", reference_name: "reference_name", other_incomes: "other_incomes", business_inventory: "business_inventory", business_receivables: "business_receivables" };
  for (const [formKey, message] of Object.entries(found)) {
    const sheetKey = MAP[formKey];
    if (sheetKey) {
      if (!errors[sheetKey]) errors[sheetKey] = message;
    } else {
      // Algo que la ficha exige y la hoja no pregunta (empresa regulada, o catálogo de países sin cargar).
      const name = FIELD_INFO[formKey]?.[1] || formKey;
      errors._other = [errors._other, `${name}: ${message}`].filter(Boolean).join(" · ");
    }
  }
  if (!errors.identification && !form.birth_date) errors.identification = "La cédula no tiene una fecha de nacimiento válida";

  const numeric = ["rate", "years_living", "experience", "other_incomes", "business_inventory", "cash_amount", "business_receivables", "amount", "term"];
  for (const f of numeric) {
    if (errors[f] || isEmpty(sheet[f])) continue;
    const n = toNum(sheet[f]);
    if (!Number.isFinite(n) || n < 0) errors[f] = "Debe ser un número mayor o igual a 0";
  }
  for (const f of ["amount", "term", "rate"]) {
    if (!errors[f] && !(toNum(sheet[f]) > 0)) errors[f] = "Debe ser mayor que 0";
  }

  // Las ventas se reparten entre crédito y contado: cada una de 0 a 100 y entre las dos 100.
  for (const f of ["credit_sales", "cash_sales"]) {
    if (errors[f] || isEmpty(sheet[f])) continue;
    const n = toNum(sheet[f]);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors[f] = "Debe ser un porcentaje de 0 a 100";
  }
  if (!errors.credit_sales && !errors.cash_sales && !isEmpty(sheet.credit_sales) && !isEmpty(sheet.cash_sales)) {
    const total = toNum(sheet.credit_sales) + toNum(sheet.cash_sales);
    if (Math.abs(total - 100) > 0.01) errors.cash_sales = "Venta a crédito y de contado deben sumar 100 %";
  }

  return errors;
}

// Cuerpo para POST /api/customers. customFields: definiciones activas de la empresa (para mandar solo las que existen).
export function customerBodyFromSheet(sheet, ctx = {}, customFields = []) {
  const { customer } = buildCustomerPayload(customerFormFromSheet(sheet, ctx));
  // «Oficio» se pregunta aunque el cliente tenga negocio propio; el armado normal solo lo manda a los empleados.
  customer.occupation = String(sheet.occupation || "").trim();
  customer.cash_amount = toNum(sheet.cash_amount) || 0;
  customer.credit_sales = toNum(sheet.credit_sales) || 0;
  customer.cash_sales = toNum(sheet.cash_sales) || 0;

  const wanted = {
    [YEARS_LIVING_KEY]: isEmpty(sheet.years_living) ? null : sheet.years_living,
    [HOUSING_KEY]: sheet.housing || null,
    [EXPERIENCE_KEY]: isEmpty(sheet.experience) ? null : sheet.experience,
  };
  const keys = new Set(customFields.map((f) => f.field_key));
  const custom_fields = Object.fromEntries(Object.entries(wanted).filter(([k]) => keys.has(k)));
  return { customer, ...(Object.keys(custom_fields).length ? { custom_fields } : {}), prospect_request: true };
}

// Datos que se pasan a «Nueva solicitud» (route.params.sim) para que el monto, plazo, frecuencia y tasa ya vengan puestos.
export function loanPrefillFromSheet(sheet) {
  return {
    amount: toNum(sheet.amount),
    term: toNum(sheet.term),
    interestRate: toNum(sheet.rate),
    frequencyId: sheet.frequencyId ?? undefined,
    fromSheet: true, // la tasa de la hoja manda sobre la que propone el producto financiero
  };
}

// Faltan en la empresa los campos personalizados que la hoja necesita (los tres se crean con el alta de la función).
export const missingCustomFields = (customFields = []) =>
  [YEARS_LIVING_KEY, HOUSING_KEY, EXPERIENCE_KEY].filter((k) => !customFields.some((f) => f.field_key === k));
