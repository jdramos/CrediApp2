import { credimasterGet, credimasterUpload } from "./credimasterClient";
import { buildImageFormData } from "../utils/imagePicker";

// Checklist de expediente documental del cliente — permiso
// clientes.checklist.ver. Cada fila trae code/title/is_mandatory/status.
export const getCustomerChecklist = (token, customerId) =>
  credimasterGet(`/api/customer-files/${customerId}/checklist`, token);

// Sube un documento y, si relatedItemCode calza con un ítem del
// checklist, lo marca OK automáticamente (lo hace el backend, no hace
// falta un segundo paso) — permiso clientes.documentos.subir.
export const uploadCustomerDocument = (token, customerId, file, { docType, docName, relatedItemCode } = {}) =>
  credimasterUpload(
    `/api/customer-files/${customerId}/documents`,
    buildImageFormData(file, { doc_type: docType, doc_name: docName, related_item_code: relatedItemCode }),
    token,
  );

// Todos los documentos subidos del cliente (también los que no son del checklist, p. ej. "Documento
// adicional") — permiso clientes.documentos.ver. Cada fila: id, doc_name, mime_type, related_item_code, uploaded_at.
export const listCustomerDocuments = (token, customerId) =>
  credimasterGet(`/api/customer-files/${customerId}/documents-list`, token);

// URL temporal (2 min) para ver/descargar un documento ya subido, con su tipo
// (mime_type) — permiso clientes.documentos.ver.
export const getCustomerDocumentUrl = (token, documentId) =>
  credimasterGet(`/api/customer-files/documents/${documentId}/download-url`, token);
