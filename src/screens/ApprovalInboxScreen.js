import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Chip, ActivityIndicator, HelperText, IconButton } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SessionContext } from "../auth/SessionContext";
import { getApprovalInbox } from "../api/approvalApi";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.sm },
  header: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2, marginBottom: SPACING.sm },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  name: { fontWeight: "700", color: COLORS.text, fontSize: 16 },
  amount: { color: COLORS.primary, fontWeight: "800", fontSize: 18, marginTop: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.sm },
  empty: { alignItems: "center", padding: SPACING.xl, gap: SPACING.sm },
});

const subtypeLabel = (item) => {
  if (item.item_type === "LOAN") return "Solicitud nueva";
  const map = { PRORROGA: "Prórroga", REESTRUCTURACION: "Reestructuración", REFINANCIAMIENTO: "Refinanciamiento" };
  return map[item.item_subtype] || "Modificación";
};

export default function ApprovalInboxScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh) => {
    setError("");
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await getApprovalInbox(session.token, { status: "PENDING" });
      setItems(res?.data || []);
    } catch (e) {
      setError(e?.message ?? "Error cargando la bandeja de aprobación");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.token]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm }}>
          <IconButton icon="arrow-left" onPress={() => navigation.goBack()} accessibilityLabel="Volver" />
          <Text variant="headlineSmall" style={styles.header}>Aprobaciones</Text>
        </View>
        <Text style={styles.sub}>Solicitudes pendientes de tu decisión</Text>
        <HelperText type="error" visible={!!error}>{error}</HelperText>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.approval_id)}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={COLORS.muted} />
              <Text style={{ color: COLORS.muted }}>No tenés solicitudes pendientes</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const approved = (item.approvals || []).filter((a) => a.status === "APPROVED").length;
            const total = (item.approvals || []).length || 1;
            return (
              <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
                <Card style={styles.card} onPress={() => navigation.navigate("ApprovalDecision", { item })}>
                  <Text style={styles.name}>{item.customer_name || "Cliente"}</Text>
                  <Text style={styles.amount}>{money(item.requested_amount)}</Text>
                  <View style={styles.metaRow}>
                    <Chip compact icon="tag-outline">{subtypeLabel(item)}</Chip>
                    {!!item.branch_name && <Chip compact icon="office-building-outline">{item.branch_name}</Chip>}
                    {!!item.requires_committee && (
                      <Chip compact icon="account-group" style={{ backgroundColor: COLORS.warningSoft }}>
                        Comité {approved}/{total}
                      </Chip>
                    )}
                    {item.pending_days != null && (
                      <Chip compact icon="clock-outline">{item.pending_days}d esperando</Chip>
                    )}
                  </View>
                </Card>
              </Animated.View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
