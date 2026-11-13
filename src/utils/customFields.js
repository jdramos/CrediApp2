// Campos personalizados por empresa (Configuración → Campos personalizados de la web).
// Espejo de credimaster-frontend/src/components/customFields/customFieldsShared.js; el servidor valida de nuevo
// (api/customFields/customFieldRules.js).

export const isEmptyValue = (value) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

// Secciones del crédito: "conditions" va con los datos del crédito, "guarantees" con garantías y documentos.
export const fieldsInSection = (fields = [], section) =>
  fields.filter((field) => field.section === section).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

const isValidIsoDate = (text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const valueError = (field, value) => {
  if (isEmptyValue(value)) return Number(field.is_required) === 1 ? "Campo requerido" : null;
  if (field.field_type === "NUMBER" && !Number.isFinite(Number(String(value).replace(/,/g, "")))) return "Debe ser un número";
  if (field.field_type === "DATE" && !isValidIsoDate(String(value).slice(0, 10))) return "Fecha no válida";
  if (field.field_type === "LIST" && !(field.options || []).includes(String(value))) return "Opción no válida";
  return null;
};

// Errores { clave: mensaje } de los campos indicados.
export const validateCustomFieldValues = (fields = [], values = {}) => {
  const errors = {};
  fields.forEach((field) => {
    const message = valueError(field, values[field.field_key]);
    if (message) errors[field.field_key] = message;
  });
  return errors;
};

// Primer mensaje de error (con el nombre del campo) o null.
export const firstCustomFieldError = (fields = [], values = {}) => {
  const errors = validateCustomFieldValues(fields, values);
  const field = fields.find((f) => errors[f.field_key]);
  return field ? `${field.label}: ${errors[field.field_key]}` : null;
};

// Valores a enviar: solo los campos activos recibidos, vacío = null.
export const customFieldsPayload = (fields = [], values = {}) =>
  Object.fromEntries(
    fields.map((field) => {
      const value = values[field.field_key];
      return [field.field_key, isEmptyValue(value) ? null : value];
    }),
  );

export const formatCustomFieldValue = (field, value) => {
  if (isEmptyValue(value)) return "—";
  switch (field.field_type) {
    case "BOOLEAN":
      return value === true || value === 1 || value === "1" || value === "true" ? "Sí" : "No";
    case "NUMBER":
      return Number(value).toLocaleString("es-NI", { maximumFractionDigits: 4 });
    case "DATE": {
      const [y, m, d] = String(value).slice(0, 10).split("-");
      return d ? `${d}/${m}/${y}` : String(value);
    }
    default:
      return String(value);
  }
};
