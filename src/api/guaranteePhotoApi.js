import { credimasterGet, credimasterUpload } from "./credimasterClient";
import { buildImageFormData } from "../utils/imagePicker";

// Fotos de una garantía (Wasabi) — permiso garantias.ver / garantias.insertar.
export const listGuaranteePhotos = (token, guaranteeId) =>
  credimasterGet(`/api/guarantees/${guaranteeId}/photos`, token);

export const uploadGuaranteePhoto = (token, guaranteeId, file) =>
  credimasterUpload(`/api/guarantees/${guaranteeId}/photos`, buildImageFormData(file), token);

// Borrar una foto usa DELETE con body — credimasterClient no lo expone, se
// arma directo acá (mismo patrón que pushApi.js::unregisterPushToken).
const BASE_URL = process.env.EXPO_PUBLIC_CREDIMASTER_API_URL;
export const deleteGuaranteePhoto = (token, photoId) =>
  fetch(`${BASE_URL}/api/guarantees/photos/${photoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
