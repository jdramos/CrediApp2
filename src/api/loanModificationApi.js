import { credimasterPost } from "./credimasterClient";

// Modificaciones de crédito (prórroga / refinanciamiento / reestructuración). La app solo SOLICITA reestructuraciones:
// la solicitud queda pendiente y la aprueban en la web (comité). Permiso creditos.modificaciones.solicitar.
// El servidor siempre reprograma el capital pendiente; el monto y los cargos no se envían.

// Vista previa (no graba nada): tabla nueva y lo que falta cobrar o revertir para poder aplicarla.
export const previewLoanModification = (token, loanId, body) =>
  credimasterPost(`/api/loan-modifications/${loanId}/preview`, body, token);

// Crea la solicitud (queda PENDING). Errores 400 con mensaje legible; 423 = día operativo de la sucursal cerrado.
export const requestLoanModification = (token, loanId, body) =>
  credimasterPost(`/api/loan-modifications/${loanId}`, body, token);
