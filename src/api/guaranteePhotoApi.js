import { credimasterGet, credimasterUpload, credimasterDelete } from "./credimasterClient";
import { buildImageFormData } from "../utils/imagePicker";

// Fotos de una garantía (Wasabi) — permiso garantias.ver / garantias.insertar.
export const listGuaranteePhotos = (token, guaranteeId) =>
  credimasterGet(`/api/guarantees/${guaranteeId}/photos`, token);

export const uploadGuaranteePhoto = (token, guaranteeId, file) =>
  credimasterUpload(`/api/guarantees/${guaranteeId}/photos`, buildImageFormData(file), token);

// Elimina una foto de garantía (también la borra del almacenamiento) —
// permiso garantias.eliminar.
export const deleteGuaranteePhoto = (token, photoId) =>
  credimasterDelete(`/api/guarantees/photos/${photoId}`, token);
