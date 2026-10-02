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

// Hook: resumen de los pagos en cola (de `date` YYYY-MM-DD, o todos si no se
// da). Se recalcula al enfocar la pantalla y cuando cambia la cantidad de
// pendientes (al encolar o al sincronizar).
export function usePendingPayments(date) {
  const { pendingCount } = useSync();
  const [summary, setSummary] = useState(() => summarizePendingPayments([], { date }));

  const refresh = useCallback(async () => {
    try {
      setSummary(summarizePendingPayments(await listQueue(), { date }));
    } catch {
      // sin acceso a la cola: no se informa nada extra
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  useEffect(() => {
    refresh();
  }, [refresh, pendingCount]);

  return summary;
}
