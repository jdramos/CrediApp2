import React, { useContext, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Button, Portal, Modal } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../auth/SessionContext";
import { useTenantLogo } from "../hooks/useTenantLogo";
import PaymentReceiptCard from "./PaymentReceiptCard";
import { appliedFromPaymentRow, buildFlatReceiptRows, buildReceiptRows, formatReceiptNumber, installmentDetailRows, totalBalanceBefore } from "../utils/receipt";
import { buildPaymentMessage, openSms, phoneOf, sendReceiptImageWhatsApp } from "../utils/contact";
import { printReceipt, buildPaymentReceiptLines } from "../utils/printer";
import { shareImage } from "../utils/shareImage";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  modal: {
    backgroundColor: COLORS.bg,
    margin: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    maxHeight: "92%",
  },
  shot: { gap: SPACING.md, backgroundColor: COLORS.bg },
  actions: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.sm },
  action: { flex: 1, borderRadius: RADIUS.md },
  actionLabel: { fontSize: 12, marginVertical: 6 },
  error: { color: COLORS.danger, marginTop: SPACING.xs },
});

// Comprobante de un cobro ya registrado (desde "Mis cobros"): se ve igual que
// el del momento del pago y se puede reenviar como imagen, por SMS o por
// WhatsApp al cliente, o imprimir. La copia muestra el monto, cómo se aplicó y el
// saldo total que le quedó al crédito después de ese pago (`balance_after`, lo
// calcula el servidor; un servidor viejo no lo manda y simplemente no se muestra).
export default function PaymentReceiptModal({ payment, onDismiss }) {
  const { session } = useContext(SessionContext);
  const logoUrl = useTenantLogo(session?.token);
  const shotRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");

  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name || "CrediMaster";
  const collectorName = session?.user?.full_name || session?.user?.user_name;

  const onShare = async () => {
    try {
      setSharing(true);
      setError("");
      const uri = await captureRef(shotRef, { format: "png", quality: 0.95 });
      await shareImage(uri, "Comprobante de pago");
    } catch (e) {
      setError(e?.message ?? "No se pudo generar el comprobante para compartir");
    } finally {
      setSharing(false);
    }
  };

  // WhatsApp: imagen del comprobante (no texto).
  const onWhatsApp = async () => {
    try {
      setError("");
      await sendReceiptImageWhatsApp(shotRef, phoneOf(payment), { kind: "PAYMENT", paymentId: payment.id, loanId: payment.loan_id });
    } catch (e) {
      setError(e?.message ?? "No se pudo generar el comprobante para WhatsApp");
    }
  };

  const message = payment
    ? buildPaymentMessage({
        tenantName,
        amount: payment.amount,
        date: payment.payment_date,
        loanLabel: payment.credit_code || payment.loan_id,
        principal: payment.principal_payment,
        interest: payment.interest_payment,
        receiptNumber: formatReceiptNumber(payment.id),
        principalAfter: payment.balance_after,
        balanceLabel: "Saldo total",
        usd: payment.usd_amount ? { foreign_amount: payment.usd_amount, fx_rate: payment.fx_rate } : null,
      })
    : "";

  // Interés flat: sin desglose de capital e interés; saldo total anterior, pago y nuevo saldo total.
  const applied = payment ? appliedFromPaymentRow(payment) : null;
  const flat = !!payment?.is_flat_plan && payment.balance_after != null;
  const rows = payment ? (flat ? buildFlatReceiptRows(applied) : buildReceiptRows(applied)) : [];
  const totalBefore = flat ? totalBalanceBefore(payment.balance_after, applied) : null;

  const onPrint = () => {
    printReceipt(
      buildPaymentReceiptLines({
        tenantName,
        customerName: payment.customer_name,
        customerIdentification: payment.customer_identification,
        customerHomeAddress: payment.home_address,
        customerBusinessAddress: payment.business_address,
        loanLabel: payment.credit_code || payment.loan_id,
        date: payment.payment_date,
        collectorName,
        amount: payment.amount,
        breakdownRows: rows,
        newBalance: payment.balance_after,
        flat,
        totalBefore,
        installmentDetail: installmentDetailRows(payment.installments),
        receiptNumber: formatReceiptNumber(payment.id),
        usd: payment.usd_amount ? { foreign_amount: payment.usd_amount, fx_rate: payment.fx_rate } : null,
      }),
    );
  };

  return (
    <Portal>
      <Modal visible={!!payment} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        {payment && (
          <>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ViewShot ref={shotRef} options={{ format: "png", quality: 0.95 }} style={styles.shot}>
                <PaymentReceiptCard
                  copy
                  tenantName={tenantName}
                  logoUrl={logoUrl}
                  customer={{
                    customer_name: payment.customer_name,
                    identification: payment.customer_identification,
                    home_address: payment.home_address,
                    business_address: payment.business_address,
                  }}
                  loanLabel={payment.credit_code || payment.loan_id}
                  date={`${payment.payment_date}${payment.time ? ` ${payment.time}` : ""}`}
                  collectorName={collectorName}
                  receiptNumber={formatReceiptNumber(payment.id)}
                  usd={payment.usd_amount ? { foreign_amount: payment.usd_amount, fx_rate: payment.fx_rate } : null}
                  amount={payment.amount}
                  rows={rows}
                  newBalance={payment.balance_after}
                  flat={flat}
                  totalBefore={totalBefore}
                  installmentDetail={installmentDetailRows(payment.installments)}
                />
              </ViewShot>
            </ScrollView>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Button compact mode="outlined" icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} style={styles.action} labelStyle={styles.actionLabel}>
                Imagen
              </Button>
              <Button compact mode="outlined" icon="message-text-outline" onPress={() => openSms(phoneOf(payment), message, { kind: "PAYMENT", paymentId: payment.id, loanId: payment.loan_id })} style={styles.action} labelStyle={styles.actionLabel}>
                SMS
              </Button>
              <Button compact mode="outlined" icon="whatsapp" onPress={onWhatsApp} style={styles.action} labelStyle={styles.actionLabel}>
                WhatsApp
              </Button>
            </View>
            <View style={styles.actions}>
              <Button compact mode="outlined" icon="printer-outline" onPress={onPrint} style={styles.action} labelStyle={styles.actionLabel}>
                Imprimir
              </Button>
              <Button compact mode="contained" onPress={onDismiss} style={styles.action} labelStyle={styles.actionLabel}>
                Cerrar
              </Button>
            </View>
          </>
        )}
      </Modal>
    </Portal>
  );
}
