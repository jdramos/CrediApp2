import { credimasterGet, credimasterPost } from "./credimasterClient";

// Reestructurar un crédito como CRÉDITO NUEVO (empresas no normadas). Permiso creditos.modificaciones.solicitar.
// El servidor arma la solicitud con los datos del crédito anterior y el monto igual al saldo total para cancelarlo hoy;
// entra a la bandeja de aprobación y, al desembolsarla, el sistema cancela el crédito anterior.
// En empresas normadas responde 409 RESTRUCTURE_REGULATED: allí se pide como modificación (loanModificationApi).

// Cómo reestructura esta empresa (política reestructuracion_credito_nuevo): "CREDITO_NUEVO" abre un crédito nuevo con otro
// número; "MISMO_CREDITO" modifica el mismo crédito y conserva su número (siempre así en empresas normadas).
export const getRestructureMethod = (token) => credimasterGet("/api/loans/restructure-method", token);

// Datos del crédito, si se puede reestructurar y el monto nuevo (saldo total de hoy).
export const getRestructureQuote = (token, loanId) =>
  credimasterGet(`/api/loans/restructure/${loanId}`, token);

// body: { note, term, interest_rate, frequency_id (tag), first_payment_date, client_reference_id, credit_evaluation_id }
export const requestLoanRestructure = (token, loanId, body) =>
  credimasterPost(`/api/loans/restructure/${loanId}`, body, token);
