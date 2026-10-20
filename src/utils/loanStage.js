import { COLORS } from "../theme/colors";

// Estado ACTUAL de una solicitud/crédito (fila de GET /api/loans), en palabras
// del cobrador. Sale de loans_data.status y de las aprobaciones:
//   DRAFT -> borrador · PENDING -> en aprobación (n de m) · APPROVED -> lista
//   para desembolso · REJECTED -> rechazada · DISBURSED -> desembolsada (y
//   entregada, si ya se confirmó la entrega) · CANCELLED -> cancelado ·
//   WRITTEN_OFF -> castigado.
export function loanStage(item) {
  const status = String(item?.status || "").toUpperCase();
  const done = Number(item?.approvals_done) || 0;
  const total = Number(item?.approvals_total) || 0;

  switch (status) {
    case "DRAFT":
      return { key: "DRAFT", label: "Borrador", color: COLORS.muted, detail: "Aún no se envió a aprobación" };
    case "PENDING":
      if (item?.approval_status === "RECHAZADO") {
        return { key: "REJECTED", label: "Rechazada", color: COLORS.danger, detail: "Una de las aprobaciones la rechazó" };
      }
      return {
        key: "PENDING",
        label: done > 0 ? "En aprobación" : "Pendiente de aprobación",
        color: COLORS.warning,
        detail: total > 0 ? `Aprobaciones: ${done} de ${total}` : "Esperando aprobación",
      };
    case "APPROVED":
      return { key: "APPROVED", label: "Aprobada", color: COLORS.success, detail: "Lista para desembolsar" };
    case "REJECTED":
      return { key: "REJECTED", label: "Rechazada", color: COLORS.danger, detail: "No fue aprobada" };
    case "DISBURSED":
      return item?.delivered_at
        ? { key: "DELIVERED", label: "Entregada", color: COLORS.primary, detail: "Desembolsada y entregada al cliente" }
        : { key: "DISBURSED", label: "Desembolsada", color: COLORS.primary, detail: "Crédito activo" };
    case "CANCELLED":
      return { key: "CANCELLED", label: "Cancelado", color: COLORS.muted, detail: "Crédito cancelado o saldado" };
    case "WRITTEN_OFF":
      return { key: "WRITTEN_OFF", label: "Castigado", color: COLORS.muted, detail: "Pasó a cartera castigada" };
    default:
      return { key: status || "UNKNOWN", label: status || "Sin estado", color: COLORS.muted, detail: "" };
  }
}
