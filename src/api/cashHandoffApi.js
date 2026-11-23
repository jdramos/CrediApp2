import { credimasterGet, credimasterPost, credimasterPut } from "./credimasterClient";

// Traspaso de efectivo de un cobrador a un desembolsador (2026-11-23):
// el desembolsador SOLICITA, el cobrador TRANSFIERE y el desembolsador CONFIRMA
// que lo recibió. Estos servicios necesitan señal (mueven dinero): no se encolan.

// Lo mío: { can_request, collector_id, custody, as_requester[], as_collector[] }.
export const getMyCashHandoffs = (token) => credimasterGet("/api/cash-handoffs/mine", token);

// Cobradores a quienes se les puede pedir efectivo.
export const getRequestableCollectors = (token) => credimasterGet("/api/cash-handoffs/collectors", token);

// Desembolsador: pide `amount` al cobrador `collectorId`.
export const requestCashHandoff = (token, { collectorId, amount, notes }) =>
  credimasterPost("/api/cash-handoffs", { collector_id: collectorId, amount, notes: notes || null }, token);

// Cobrador: entrega el efectivo (por omisión lo pedido; a lo más lo pedido).
export const sendCashHandoff = (token, id, { amount, notes } = {}) =>
  credimasterPut(`/api/cash-handoffs/${id}/send`, { amount, notes: notes || null }, token);

// Cobrador: no puede dar el efectivo.
export const declineCashHandoff = (token, id, reason) => credimasterPut(`/api/cash-handoffs/${id}/decline`, { reason }, token);

// Desembolsador: cancela lo que nadie ha atendido.
export const cancelCashHandoff = (token, id) => credimasterPut(`/api/cash-handoffs/${id}/cancel`, {}, token);

// Desembolsador: ya recibió el efectivo (entra a su caja de campo).
export const confirmCashHandoff = (token, id) => credimasterPut(`/api/cash-handoffs/${id}/confirm`, {}, token);

// Desembolsador: el cobrador dijo que lo entregó pero no lo recibió.
export const notReceivedCashHandoff = (token, id, reason) =>
  credimasterPut(`/api/cash-handoffs/${id}/not-received`, { reason }, token);
