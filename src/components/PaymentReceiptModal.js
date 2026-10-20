import React, { useContext, useRef, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Button, Portal, Modal } from "react-native-paper";
import ViewShot, { captureRef } from "react-native-view-shot";
import { SessionContext } from "../auth/SessionContext";
import { useTenantLogo } from "../hooks/useTenantLogo";
import PaymentReceiptCard from "./PaymentReceiptCard";
import { appliedFromPaymentRow, buildReceiptRows, formatReceiptNumber } from "../utils/receipt";
import { buildPaymentMessage, openSms, openWhatsApp, phoneOf } from "../utils/contact";
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
// WhatsApp al cliente, o imprimir. Los saldos de ese día no se guardan, así que
// la copia muestra el monto y cómo se aplicó.
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

  const message = payment
    ? buildPaymentMessage({
        tenantName,
        amount: payment.amount,
        date: payment.payment_date,
        loanLabel: payment.credit_code || payment.loan_id,
        principal: payment.principal_payment,
        interest: payment.interest_payment,
        receiptNumber: formatReceiptNumber(payment.id),
      })
    : "";

  const rows = payment ? buildReceiptRows(appliedFromPaymentRow(payment)) : [];

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
        receiptNumber: formatReceiptNumber(payment.id),
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
                  amount={payment.amount}
                  rows={rows}
                />
              </ViewShot>
            </ScrollView>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Button compact mode="outlined" icon="share-variant" onPress={onShare} loading={sharing} disabled={sharing} style={styles.action} labelStyle={styles.actionLabel}>
                Imagen
              </Button>
              <Button compact mode="outlined" icon="message-text-outline" onPress={() => openSms(phoneOf(payment), message)} style={styles.action} labelStyle={styles.actionLabel}>
                SMS
              </Button>
              <Button compact mode="outlined" icon="whatsapp" onPress={() => openWhatsApp(phoneOf(payment), message)} style={styles.action} labelStyle={styles.actionLabel}>
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
