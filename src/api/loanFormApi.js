import { credimasterGet } from "./credimasterClient";

// Consultas de apoyo de la solicitud de crédito (las mismas que usa el formulario de la web).

// Productos financieros de la empresa. Responde { data: [...], regulated, interest_types }. Con active=1 solo los
// activos. Si la empresa no tiene productos, data viene vacío y la solicitud funciona como siempre.
export const getLoanProducts = (token) => credimasterGet("/api/loan-products?active=1", token);

// Campos personalizados activos de una entidad ("LOAN" o "CUSTOMER") y, si se pasa recordId, los valores guardados de
// ese registro (al editar). Responde { data: { fields: [...], values: {...} } }.
export const getCustomFieldsForm = (token, entity, recordId = null) =>
  credimasterGet(`/api/custom-fields/form/${entity}${recordId ? `?record_id=${encodeURIComponent(recordId)}` : ""}`, token);

export const getLoanCustomFields = (token, recordId = null) => getCustomFieldsForm(token, "LOAN", recordId);

// Cédula vencida / por vencer del cliente y si la política congela las solicitudes.
// Responde { data: { status: "VALID"|"EXPIRING"|"EXPIRED"|"NO_DATE", expiration_date, days_left, freeze_policy } }.
export const getIdentityStatus = (token, customerId) =>
  credimasterGet(`/api/loans/customer/${customerId}/identity-status`, token);

// Política de represtamo: { data: { eligible, reasons: [...] } }. No bloquea; manda la solicitud a Comité de Crédito.
export const getReprestamoEligibility = (token, customerId) =>
  credimasterGet(`/api/loans/customer/${customerId}/represtamo-eligibility`, token);
