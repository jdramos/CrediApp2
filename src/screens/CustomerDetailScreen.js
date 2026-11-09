import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, Chip } from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SessionContext } from "../auth/SessionContext";
import { getCustomer, getCustomerInfoUpdate } from "../api/customerApi";
import InfoUpdateBanner from "../components/InfoUpdateBanner";
import { getAllLoans } from "../api/loanApi";
import { money } from "../utils/format";
import { loanStage } from "../utils/loanStage";
import { COLORS } from "../theme/colors";
import CopyableId from "../components/CopyableId";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";
import { withCode } from "../utils/customerLabel";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
  header: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  infoText: { color: COLORS.text, flex: 1 },
  sectionTitle: { fontWeight: "800", color: COLORS.text, marginTop: SPACING.sm },
  loanRow: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  loanTitle: { fontWeight: "700", color: COLORS.text },
  balance: { color: COLORS.primary, fontWeight: "800", fontSize: 18, marginTop: 2 },
});

const InfoRow = ({ icon, text }) =>
  text ? (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.muted} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  ) : null;

export default function CustomerDetailScreen({ route, navigation }) {
  const { customerId } = route.params;
  const { session } = useContext(SessionContext);
  const canViewLoans = session?.permissions?.includes("creditos.ver");
  const canRequestLoan = session?.permissions?.includes("creditos.insertar");
  const canEvaluate = ["clientes.evaluacion.insertar", "clientes.evaluacion.ver"].some((p) => session?.permissions?.includes(p));
  const canOpenFile = ["clientes.checklist.ver", "clientes.documentos.subir", "garantias.ver", "garantias.insertar"].some(
    (p) => session?.permissions?.includes(p),
  );

  // Expediente: plazo por nivel de riesgo, solo alerta (dueño, 2026-11-05).
  const canUpdateInfo = ["clientes.expediente.actualizar", "clientes.editar"].some((p) => session?.permissions?.includes(p));
  const [infoStatus, setInfoStatus] = useState(null);

  const [customer, setCustomer] = useState(null);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          setLoading(true);
          setError("");
          const res = await getCustomer(session.token, customerId);
          if (alive) setCustomer(res?.data?.customer || null);
        } catch (e) {
          if (alive) setError(e?.message ?? "Error cargando el cliente");
        } finally {
          if (alive) setLoading(false);
        }
      })();

      getCustomerInfoUpdate(session.token, customerId)
        .then((res) => alive && setInfoStatus(res?.data || null))
        .catch(() => alive && setInfoStatus(null));

      if (canViewLoans) {
        (async () => {
          try {
            setLoadingLoans(true);
            // Todos los créditos del cliente (cualquier estado) -- no el
            // resumen de "activos con saldo" (ese solo trae DISBURSED,
            // pensado para elegir a cuál pagarle, no para ver el estado
            // general del cliente).
            const res = await getAllLoans(session.token, {
              customer_id: customerId,
              sortBy: "a.date",
              sortOrder: "DESC",
            });
            if (alive) setLoans(res?.data || []);
          } catch {
            // silencioso: la sección de créditos simplemente queda vacía
          } finally {
            if (alive) setLoadingLoans(false);
          }
        })();
      }

      return () => { alive = false; };
    }, [customerId, session.token, canViewLoans]),
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headlineSmall" style={styles.header}>{withCode(customer?.customer_name, customer?.customer_code)}</Text>
        <CopyableId label="Cédula: " value={customer?.identification} textStyle={styles.sub} />

        <HelperText type="error" visible={!!error}>{error}</HelperText>

        <InfoUpdateBanner status={infoStatus} />

        <View style={styles.card}>
          <InfoRow icon="phone-outline" text={customer?.cellphone || customer?.telephone} />
          <InfoRow icon="home-outline" text={customer?.home_address} />
          <InfoRow icon="briefcase-outline" text={customer?.business_address} />
          <Button
            mode="outlined"
            icon="map-marker-outline"
            onPress={() => navigation.navigate("CustomerLocation", { customerId })}
            style={{ marginTop: SPACING.md, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
          >
            Ver / editar ubicación
          </Button>
          {canUpdateInfo && (
            <Button
              mode={["OVERDUE", "DUE_SOON"].includes(infoStatus?.status) ? "contained" : "outlined"}
              icon="account-edit-outline"
              onPress={() => navigation.navigate("CustomerInfoUpdate", { customerId, customerName: customer?.customer_name })}
              style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              Actualizar expediente
            </Button>
          )}
          {canRequestLoan && !!customer?.id && (
            <Button
              mode="contained"
              icon="cash-plus"
              onPress={() => navigation.navigate("Creditos", { screen: "NewLoanRequest", params: { customer } })}
              style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              Solicitar crédito
            </Button>
          )}
          {canEvaluate && (
            <Button
              mode="outlined"
              icon="chart-box-outline"
              onPress={() => navigation.navigate("CustomerEvaluation", { customerId, customerName: customer?.customer_name })}
              style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              Evaluación financiera
            </Button>
          )}
          {canOpenFile && (
            <Button
              mode="outlined"
              icon="folder-image"
              onPress={() => navigation.navigate("CustomerFile", { customerId, customerName: customer?.customer_name })}
              style={{ marginTop: SPACING.sm, borderRadius: RADIUS.md, alignSelf: "flex-start" }}
            >
              Expediente y garantías (fotos)
            </Button>
          )}
        </View>

        {canViewLoans && (
          <>
            <Text style={styles.sectionTitle}>Créditos</Text>
            {loadingLoans && <ActivityIndicator style={{ marginTop: SPACING.sm }} />}
            {!loadingLoans && loans.length === 0 && (
              <Text style={{ color: COLORS.muted }}>Este cliente no tiene créditos.</Text>
            )}
            <FlatList
              data={loans}
              keyExtractor={(item) => String(item.id || item.loan_id)}
              scrollEnabled={false}
              renderItem={({ item }) => {
                // Estado real del crédito (cancelado, desembolsado, en aprobación...). Antes se mostraba el
                // estado de las aprobaciones, que sale "Pendiente" cuando no hay registro (créditos migrados o
                // anteriores al flujo de aprobación), aunque el crédito ya estuviera pagado.
                const stage = loanStage(item);
                return (
                  <Card
                    style={styles.loanRow}
                    onPress={() => navigation.navigate("LoanDetail", { loanId: item.id || item.loan_id })}
                  >
                    <Text style={styles.loanTitle}>Crédito #{item.id || item.loan_id}</Text>
                    <Text style={styles.balance}>{money(item.display_balance ?? item.current_balance)}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                      {item.date} · {money(item.amount)}
                    </Text>
                    {!!stage.label && (
                      <Chip
                        compact
                        style={{ marginTop: SPACING.xs, alignSelf: "flex-start", backgroundColor: COLORS.bg }}
                        textStyle={{ color: stage.color, fontWeight: "700", fontSize: 11 }}
                      >
                        {stage.label}
                      </Chip>
                    )}
                  </Card>
                );
              }}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
