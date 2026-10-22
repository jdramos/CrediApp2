import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Badge } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { SessionContext } from "../auth/SessionContext";
import { getApprovalInbox } from "../api/approvalApi";
import { getLoans } from "../api/loanApi";
import { getPendingDeliveries } from "../api/remittanceApi";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  header: { fontWeight: "800", color: COLORS.text },
  sub: { color: COLORS.muted, marginTop: 2, marginBottom: SPACING.sm },
  action: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOW.card,
  },
  actionTitle: { color: COLORS.onGradient, fontWeight: "800", fontSize: 18, marginTop: SPACING.sm },
  actionSub: { color: COLORS.onGradientMuted, marginTop: 2 },
});

function ActionCard({ icon, title, subtitle, gradient, onPress, badge }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInDown.springify()} style={style}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={onPress}
      >
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.action}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <MaterialCommunityIcons name={icon} size={30} color={COLORS.onGradient} />
            {badge != null && badge > 0 && (
              <Badge style={{ backgroundColor: COLORS.onGradient, color: gradient[0] }}>{badge}</Badge>
            )}
          </View>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.actionSub}>{subtitle}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function CreditsHomeScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [pendingCount, setPendingCount] = useState(0);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [pendingDeliveries, setPendingDeliveries] = useState(0);

  const canCreate = session?.permissions?.includes("creditos.insertar");
  const canSimulate = session?.permissions?.includes("creditos.amortizacion.ver");
  const canApprove = session?.permissions?.includes("aprobaciones.ver");
  const canView = session?.permissions?.includes("creditos.ver");
  const canDeliver = session?.permissions?.includes("especial.creditos.entregar");

  useFocusEffect(
    useCallback(() => {
      if (!canApprove) return;
      getApprovalInbox(session.token, { status: "PENDING", limit: 1 })
        .then((res) => setPendingCount(res?.summary?.total ?? 0))
        .catch(() => {});
    }, [canApprove, session.token]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!canView) return;
      getLoans(session.token, { status: "PENDIENTE", mine: "1", limit: 1 })
        .then((res) => setMyPendingCount(res?.total ?? 0))
        .catch(() => {});
    }, [canView, session.token]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!canDeliver) return;
      getPendingDeliveries(session.token)
        .then((res) => setPendingDeliveries((res?.data || []).length))
        .catch(() => {});
    }, [canDeliver, session.token]),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="headlineSmall" style={styles.header}>Créditos</Text>
        <Text style={styles.sub}>Solicitudes y aprobaciones</Text>

        {canCreate && (
          <ActionCard
            icon="file-document-plus-outline"
            title="Nueva solicitud"
            subtitle="Registrar una solicitud de crédito"
            gradient={GRADIENTS.primary}
            onPress={() => navigation.navigate("NewLoanRequest")}
          />
        )}

        {canSimulate && (
          <ActionCard
            icon="calculator-variant-outline"
            title="Simulador de crédito"
            subtitle="Calcular cuota y plan de pagos"
            gradient={GRADIENTS.success}
            onPress={() => navigation.navigate("LoanSimulator")}
          />
        )}

        {canApprove && (
          <ActionCard
            icon="clipboard-check-outline"
            title="Aprobaciones"
            subtitle="Revisar solicitudes pendientes"
            gradient={GRADIENTS.warning}
            badge={pendingCount}
            onPress={() => navigation.navigate("ApprovalInbox")}
          />
        )}

        {canView && (
          <ActionCard
            icon="format-list-bulleted"
            title="Mis solicitudes"
            subtitle="Estado, historial y filtros"
            gradient={GRADIENTS.dark}
            badge={myPendingCount}
            onPress={() => navigation.navigate("MyLoanRequests")}
          />
        )}

        {canDeliver && (
          <ActionCard
            icon="truck-delivery-outline"
            title="Entregas pendientes"
            subtitle="Confirmar entrega al cliente"
            gradient={GRADIENTS.success}
            badge={pendingDeliveries}
            onPress={() => navigation.navigate("PendingDeliveries")}
          />
        )}

        {!canCreate && !canApprove && !canView && !canDeliver && !canSimulate && (
          <Text style={{ color: COLORS.muted, marginTop: SPACING.lg, textAlign: "center" }}>
            No tenés permisos de crédito asignados.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
