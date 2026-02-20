export const mockSummary = {
  collected_today_amount: 18500.75,
  collected_today_count: 23,
  portfolio_total: 1250000.0,
  overdue_amount: 92350.25,
  overdue_customers: 41,
  credit_requests_pending: 12,
  approvals_pending: 4,
};

export const mockBalances = [
  { id: 1, customer: "Juan Pérez", identification: "001-010101-0001A", saldoTotal: 12500.5, mora: 0, branch: "Central" },
  { id: 2, customer: "María López", identification: "001-020202-0002B", saldoTotal: 8820.0, mora: 320.5, branch: "Central" },
  { id: 3, customer: "Carlos Ruiz", identification: "001-030303-0003C", saldoTotal: 54000.0, mora: 0, branch: "Masaya" },
];

export const mockPayments = [
  { id: 101, customer: "María López", amount: 450, date: "2026-02-20", method: "Efectivo" },
  { id: 102, customer: "Juan Pérez", amount: 650, date: "2026-02-20", method: "Transferencia" },
];

export const mockCreditRequests = [
  { id: 201, customer: "Juan Pérez", amount: 20000, term: 12, status: "PENDING", pendingApprovers: 2 },
  { id: 202, customer: "María López", amount: 35000, term: 18, status: "PARTIAL_APPROVED", pendingApprovers: 1 },
];

export const mockApprovalsInbox = [
  { id: 301, credit_request_id: 201, customer: "Juan Pérez", amount: 20000, status: "PENDING", pendingApprovers: 2 },
  { id: 302, credit_request_id: 202, customer: "María López", amount: 35000, status: "PARTIAL_APPROVED", pendingApprovers: 1 },
];