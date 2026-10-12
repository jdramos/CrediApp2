import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Button, ActivityIndicator, HelperText, Chip } from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SessionContext } from "../auth/SessionContext";
import { getCustomer } from "../api/customerApi";
import { getLoans } from "../api/loanApi";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
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

const STATUS_COLOR = {
  PENDIENTE: COLORS.warning, PENDING: COLORS.warning,
  APROBADO: COLORS.success, APPROVED: COLORS.success,
  RECHAZADO: COLORS.danger, REJECTED: COLORS.danger,
  DISBURSED: COLORS.primary, CANCELLED: COLORS.muted, WRITTEN_OFF: COLORS.muted, DRAFT: COLORS.muted,
};
const STATUS_LABEL = {
  PENDIENTE: "Pendiente", PENDING: "Pendiente",
  APROBADO: "Aprobado", APPROVED: "Aprobado",
  RECHAZADO: "Rechazado", REJECTED: "Rechazado",
  DISBURSED: "Desembolsado", CANCELLED: "Cancelado", WRITTEN_OFF: "Castigado", DRAFT: "Borrador",
};

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
  const canOpenFile = ["clientes.checklist.ver", "clientes.documentos.subir", "garantias.ver", "garantias.insertar"].some(
    (p) => session?.permissions?.includes(p),
  );

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

      if (canViewLoans) {
        (async () => {
          try {
            setLoadingLoans(true);
            // Todos los créditos del cliente (cualquier estado) -- no el
            // resumen de "activos con saldo" (ese solo trae DISBURSED,
            // pensado para elegir a cuál pagarle, no para ver el estado
            // general del cliente).
            const res = await getLoans(session.token, {
              customer_id: customerId,
              sortBy: "a.date",
              sortOrder: "DESC",
              limit: 50,
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
        <Text variant="headlineSmall" style={styles.header}>{customer?.customer_name || "Cliente"}</Text>
        <Text style={styles.sub}>Cédula: {customer?.identification || "-"}</Text>

        <HelperText type="error" visible={!!error}>{error}</HelperText>

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
                const st = item.approval_status || item.status;
                return (
                  <Card
                    style={styles.loanRow}
                    onPress={() => navigation.navigate("LoanDetail", { loanId: item.id || item.loan_id })}
                  >
                    <Text style={styles.loanTitle}>Crédito #{item.id || item.loan_id}</Text>
                    <Text style={styles.balance}>{money(item.current_balance)}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                      {item.date} · {money(item.amount)}
                    </Text>
                    {!!st && (
                      <Chip
                        compact
                        style={{ marginTop: SPACING.xs, alignSelf: "flex-start", backgroundColor: COLORS.bg }}
                        textStyle={{ color: STATUS_COLOR[st] || COLORS.muted, fontWeight: "700", fontSize: 11 }}
                      >
                        {STATUS_LABEL[st] || st}
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
