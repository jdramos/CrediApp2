import { credimasterGet, credimasterPut, credimasterUpload } from "./credimasterClient";
import { buildImageFormData } from "../utils/imagePicker";

// Entregas pendientes asignadas a este usuario como delivery_agent —
// permiso especial.creditos.entregar. Solo créditos ya desembolsados
// (DESEMBOLSADO) que todavía no se marcaron como entregados.
export const getPendingDeliveries = (token) =>
  credimasterGet("/api/loans/remittances/pending-delivery", token);

// Marca un desembolso como entregado, con foto opcional (obligatoria si
// la política delivery_image_required está activa — el backend valida
// eso, acá solo se manda lo que haya). Campo de archivo: "image" (no
// "file", a diferencia de garantías/documentos de cliente).
export const markDelivered = (token, loanId, { deliveryNotes, file } = {}) => {
  if (file) {
    const form = buildImageFormData(file, { delivery_notes: deliveryNotes }, "image");
    return credimasterUpload(`/api/loans/${loanId}/remittance/deliver`, form, token, "PUT");
  }
  return credimasterPut(`/api/loans/${loanId}/remittance/deliver`, { delivery_notes: deliveryNotes || null }, token);
};
