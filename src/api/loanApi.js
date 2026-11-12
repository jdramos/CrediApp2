import { credimasterGet, credimasterPost, credimasterPut } from "./credimasterClient";

// Créditos activos de un cliente (para elegir cuál pagar) — permiso
// creditos.ver.
export const getCustomerActiveLoans = (token, customerId) =>
  credimasterGet(`/api/loans/customer/${customerId}/active-summary`, token);

// Detalle de un crédito (saldo actual, estado) — permiso
// creditos.detalle.ver.
export const getLoanDetail = (token, loanId) =>
  credimasterGet(`/api/loans/${loanId}`, token);

// Tabla de amortización — permiso creditos.amortizacion.ver. Sirve para
// mostrar cuál es la próxima cuota antes de registrar un pago.
export const getLoanAmortization = (token, loanId) =>
  credimasterGet(`/api/loans/amortization/${loanId}`, token);

// Crea una solicitud de crédito nueva (queda en PENDING, esperando
// aprobación). Permiso creditos.insertar. El backend valida mucho más
// de lo que se manda acá (expediente del cliente, políticas de crédito,
// garantías) — cualquier requisito faltante vuelve como un 400 con un
// mensaje legible, que se muestra tal cual en la pantalla.
export const createLoanRequest = (token, payload) =>
  credimasterPost("/api/loans", payload, token);

// Modifica una solicitud que sigue PENDIENTE de aprobación (PUT /api/loans/:loanId). Permiso creditos.editar,
// o creditos.insertar si la solicitud la registró el propio usuario (el originador). Lleva el mismo cuerpo que
// createLoanRequest; el cliente no se puede cambiar. Reinicia las aprobaciones y recalcula la tabla de cuotas.
// 409 = ya no está pendiente; 403 = no es suya; 423 = día operativo cerrado.
export const updateLoanRequest = (token, loanId, payload) =>
  credimasterPut(`/api/loans/${loanId}`, payload, token);

// Lista de créditos con filtros — permiso creditos.ver. `params` admite
// page/limit, status ("PENDIENTE"/"APROBADO"/"RECHAZADO", vacío = todos),
// startDate/endDate (deben ir juntos), search (nombre o cédula) y
// branch_id. El backend NO limita por sucursal automáticamente — si no
// se manda branch_id, devuelve créditos de todo el tenant.
export const getLoans = (token, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ).toString();
  return credimasterGet(`/api/loans${qs ? `?${qs}` : ""}`, token);
};

// Todos los créditos que cumplen el filtro, no solo la primera página: pide de
// a 500 (el máximo del servidor) hasta completar el total. Puede tardar si hay
// muchos, pero la lista queda completa (regla del dueño: se pueden ver todos
// aunque cargue lento). `total` sigue siendo el del servidor.
export const getAllLoans = async (token, params = {}) => {
  const PAGE = 500;
  const MAX_PAGES = 40; // tope de seguridad: 20,000 créditos
  const first = await getLoans(token, { ...params, page: 1, limit: PAGE });
  const rows = [...(first?.data || [])];
  const total = Number(first?.total ?? rows.length);
  for (let page = 2; rows.length < total && page <= MAX_PAGES; page += 1) {
    const next = await getLoans(token, { ...params, page, limit: PAGE });
    const chunk = next?.data || [];
    if (!chunk.length) break;
    rows.push(...chunk);
  }
  return { ...first, data: rows, total };
};

// Estado de cuenta completo (saldo capital/interés/seguro/cargos, mora,
// y el detalle de cada cuota) — permiso creditos.estado_cuenta.ver.
export const getAccountStatement = (token, loanId, date) =>
  credimasterGet(`/api/loans/${loanId}/account-statement${date ? `?date=${date}` : ""}`, token);

// Tabla de amortización de una simulación (no guarda nada) — permiso
// creditos.amortizacion.ver. El tipo de interés lo define la empresa, no el
// formulario. `term` va en MESES; la cantidad de cuotas sale de la frecuencia
// (`frequency_id` es el tag: D, S, B, Q, M, BM, TM, CM, SM, A). Devuelve el
// arreglo de cuotas con la fila 0 del desembolso.
export const simulateLoan = (token, { amount, interest_rate, term, requestDate, fee, insurance, other_charges, frequency_id, branch_id, first_payment_date }) =>
  credimasterPost(
    "/api/loans/amortization",
    {
      amount, interest_rate, term, requestDate, fee: fee || 0, insurance: insurance || 0, other_charges: other_charges || 0, frequency_id, branch_id,
      // Primera cuota pactada (solo si se cambió la sugerida).
      ...(first_payment_date ? { first_payment_date } : {}),
    },
    token,
  );

