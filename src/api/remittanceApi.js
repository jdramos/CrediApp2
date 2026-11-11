import { credimasterGet, credimasterPut, credimasterUpload } from "./credimasterClient";
import { buildImagesFormData } from "../utils/imagePicker";

// Entregas pendientes asignadas a este usuario como delivery_agent —
// permiso especial.creditos.entregar. Solo créditos ya desembolsados
// (DESEMBOLSADO) que todavía no se marcaron como entregados.
export const getPendingDeliveries = (token) =>
  credimasterGet("/api/loans/remittances/pending-delivery", token);

// Máximo de fotos por entrega (el backend rechaza más).
export const MAX_DELIVERY_PHOTOS = 5;

// Marca un desembolso como entregado, con las fotos de evidencia (al menos una
// si la política delivery_image_required está activa — el backend valida eso,
// acá solo se manda lo que haya). Campo de archivos: "images" (no "file", a
// diferencia de garantías/documentos de cliente).
export const markDelivered = (token, loanId, { deliveryNotes, files = [] } = {}) => {
  if (files.length) {
    const form = buildImagesFormData(files, { delivery_notes: deliveryNotes }, "images");
    return credimasterUpload(`/api/loans/${loanId}/remittance/deliver`, form, token, "PUT");
  }
  return credimasterPut(`/api/loans/${loanId}/remittance/deliver`, { delivery_notes: deliveryNotes || null }, token);
};

// «No se pudo entregar» (2026-11-10): el desembolsador reporta que no logró
// entregar el dinero. `reasonCode`: CLIENTE_AUSENTE | CLIENTE_DESISTE |
// DIRECCION_INCORRECTA | OTRO («Otro» exige la nota). Fotos opcionales. La
// entrega sale de sus pendientes y la oficina decide si se reprograma o si
// recibe el dinero y anula el desembolso.
export const reportNotDelivered = (token, loanId, { reasonCode, notes, files = [] } = {}) => {
  if (files.length) {
    const form = buildImagesFormData(files, { reason_code: reasonCode, notes }, "images");
    return credimasterUpload(`/api/loans/${loanId}/remittance/not-delivered`, form, token, "PUT");
  }
  return credimasterPut(`/api/loans/${loanId}/remittance/not-delivered`, { reason_code: reasonCode, notes: notes || null }, token);
};
