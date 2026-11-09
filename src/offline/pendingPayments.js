import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listQueue } from "./queue";
import { useSync } from "./SyncProvider";

// Pagos que el cobrador registró SIN conexión y siguen en la cola (todavía no
// llegaron al servidor, así que no cuentan en lo "cobrado" que devuelve el
// backend). `payment_amount` es lo que cobró en efectivo/transferencia, que
// es lo que el cobrador tiene en la mano aunque el servidor aún no lo sepa.
//
//  - PENDING: se enviarán solos cuando vuelva la señal.
//  - FAILED: el servidor los rechazó (ver la pantalla de pendientes); se
//    cuentan aparte porque NO se van a enviar sin que alguien los revise.

export function summarizePendingPayments(items, { date } = {}) {
  const out = { count: 0, amount: 0, cashAmount: 0, failedCount: 0, failedAmount: 0 };
  for (const item of items || []) {
    if (item.type !== "PAYMENT") continue;
    const p = item.payload || {};
    if (date && p.payment_date !== date) continue;
    const amount = Number(p.payment_amount) || 0;
    if (item.status === "FAILED") {
      out.failedCount += 1;
      out.failedAmount += amount;
    } else {
      out.count += 1;
      out.amount += amount;
      // 1 = Efectivo (conami_forma_pago), el mismo id que usa el backend.
      if (Number(p.payment_method_id) === 1) out.cashAmount += amount;
    }
  }
  return out;
}

// Pagos por enviar (PENDING) cuya fecha cae en [from, to] (YYYY-MM-DD), del más nuevo al más viejo,
// para mostrarlos en "Mis cobros" junto a los ya registrados en el servidor.
export function pendingPaymentRows(items, { from, to } = {}) {
  return (items || [])
    .filter((i) => i.type === "PAYMENT" && i.status !== "FAILED")
    .filter((i) => {
      const d = i.payload?.payment_date;
      return (!from || d >= from) && (!to || d <= to);
    })
    .map((i) => ({
      key: i.id,
      label: i.label,
      date: i.payload?.payment_date,
      amount: Number(i.payload?.payment_amount) || 0,
      loanId: i.payload?.loan_id,
      createdAt: i.createdAt,
      usd: i.payload?.usd || null,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Hook: resumen de los pagos en cola (de `date` YYYY-MM-DD, o todos si no se
// da). Se recalcula al enfocar la pantalla y cuando cambia la cantidad de
// pendientes (al encolar o al sincronizar).
export function usePendingPayments(date, range) {
  const { pendingCount } = useSync();
  const [summary, setSummary] = useState(() => summarizePendingPayments([], { date }));
  const [rows, setRows] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const items = await listQueue();
      setSummary(summarizePendingPayments(items, { date }));
      setRows(pendingPaymentRows(items, range));
    } catch {
      // sin acceso a la cola: no se informa nada extra
    }
  }, [date, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  useEffect(() => {
    refresh();
  }, [refresh, pendingCount]);

  return { ...summary, rows };
}
