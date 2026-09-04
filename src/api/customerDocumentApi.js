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
