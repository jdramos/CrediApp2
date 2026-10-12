import { credimasterGet, credimasterUpload, credimasterDelete } from "./credimasterClient";
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

// URL temporal (2 min) para ver/descargar un documento ya subido, con su tipo
// (mime_type) — permiso clientes.documentos.ver.
export const getCustomerDocumentUrl = (token, documentId) =>
  credimasterGet(`/api/customer-files/documents/${documentId}/download-url`, token);

// Elimina un documento del expediente (y lo borra del almacenamiento); si era
// el único de su ítem del checklist, el ítem vuelve a pendiente — permiso
// clientes.documentos.eliminar.
export const deleteCustomerDocument = (token, documentId) =>
  credimasterDelete(`/api/customer-files/documents/${documentId}`, token);
