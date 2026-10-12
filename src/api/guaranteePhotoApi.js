import { credimasterGet, credimasterUpload } from "./credimasterClient";
import { buildImageFormData } from "../utils/imagePicker";

// Fotos de una garantía (Wasabi) — permiso garantias.ver / garantias.insertar.
export const listGuaranteePhotos = (token, guaranteeId) =>
  credimasterGet(`/api/guarantees/${guaranteeId}/photos`, token);

export const uploadGuaranteePhoto = (token, guaranteeId, file) =>
  credimasterUpload(`/api/guarantees/${guaranteeId}/photos`, buildImageFormData(file), token);
