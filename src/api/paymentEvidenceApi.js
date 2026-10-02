import { credimasterUpload } from "./credimasterClient";
import { buildImageFormData } from "../utils/imagePicker";

// Evidencia de un cobro (foto del comprobante/cliente o firma del cliente) —
// permiso pagos.insertar. Se identifica el pago por `payment_id` (pago ya
// registrado en línea) o por `client_reference_id` (pago hecho SIN conexión:
// el celular ya conoce ese id al encolarlo, así la evidencia puede subirse
// después sin saber qué id le dio el servidor). `kind`: PHOTO | SIGNATURE.
export const uploadPaymentEvidence = (token, { file, kind, payment_id, client_reference_id }) =>
  credimasterUpload(
    "/api/payments/evidence",
    buildImageFormData(file, { kind, payment_id, client_reference_id }),
    token,
  );
