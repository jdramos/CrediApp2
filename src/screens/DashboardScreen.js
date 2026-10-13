import React, { useCallback, useContext, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Badge } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { SessionContext } from "../auth/SessionContext";
import { getApprovalInbox } from "../api/approvalApi";
import { getAssignedLoans } from "../api/collectionsApi";
import { useSync } from "../offline/SyncProvider";
import { useBusinessDayAlerts } from "../hooks/useBusinessDayStatus";
import BusinessDayBanner from "../components/BusinessDayBanner";
import { syncReminders } from "../notifications/reminders";
import { workdayRequired } from "../tracking/workday";
import { useTenantLogo } from "../hooks/useTenantLogo";
import WorkdayCard from "../components/WorkdayCard";
import { money } from "../utils/format";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  greeting: { color: COLORS.onGradientMuted, fontWeight: "600" },
  name: { color: COLORS.onGradient, fontWeight: "800", marginTop: 2 },
  date: { color: COLORS.onGradientMuted, marginTop: SPACING.xs, textTransform: "capitalize" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  searchText: { color: COLORS.muted, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.md },
  sectionTitle: { fontWeight: "800", color: COLORS.text, marginTop: SPACING.sm },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  action: {
    width: "47%",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  actionTitle: { color: COLORS.onGradient, fontWeight: "800", marginTop: SPACING.sm },
  actionSub: { color: COLORS.onGradientMuted, fontSize: 12, marginTop: 2 },
});

function ActionTile({ icon, title, subtitle, gradient, onPress, badge }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInDown.springify()} style={[styles.action, { padding: 0 }, style]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.96); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={onPress}
      >
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: RADIUS.lg, padding: SPACING.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <MaterialCommunityIcons name={icon} size={26} color={COLORS.onGradient} />
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

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { session, signOut } = useContext(SessionContext);
  const { pendingCount: pendingSyncCount } = useSync();
  const [pendingCount, setPendingCount] = useState(0);
  const [overdueLoans, setOverdueLoans] = useState({ count: 0, amount: 0 });

  const businessDayAlerts = useBusinessDayAlerts(session?.token, session?.user?.branches);
  const multiBranch = (session?.user?.branches || []).length > 1;

  const canApprove = session?.permissions?.includes("aprobaciones.ver");
  const canCreateLoan = session?.permissions?.includes("creditos.insertar");
  const canPay = session?.permissions?.includes("pagos.insertar") || session?.permissions?.includes("pagos.ver");
  const canSupervise = session?.permissions?.includes("creditos.productividad.ver");
  const canViewCustomers = session?.permissions?.includes("clientes.ver");

  const logoUrl = useTenantLogo(session?.token);
  const fullName = session?.user?.full_name || session?.user?.user_name || "Usuario";
  const tenantName = session?.tenant?.commercial_name || session?.tenant?.legal_name || "";

  const todayLabel = useMemo(() => {
    const now = new Date();
    return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} de ${now.toLocaleDateString("es-NI", { month: "long" })}`;
  }, []);

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
      if (!canPay) return;
      getAssignedLoans(session.token)
        .then((res) => {
          const loans = res?.data || [];
          const overdue = loans.filter((l) => Number(l.days_overdue) > 0);
          const amount = overdue.reduce(
            (sum, l) => sum + Number(l.principal_balance || 0) + Number(l.interest_balance || 0),
            0,
          );
          setOverdueLoans({ count: overdue.length, amount });
        })
        .catch(() => {});
    }, [canPay, session.token]),
  );

  // Recordatorios locales de cobro (mañana y tarde): se re-programan al abrir
  // el inicio, con un límite de una vez cada 30 minutos (ver reminders.js).
  useFocusEffect(
    useCallback(() => {
      if (!canPay) return;
      syncReminders(session.token, { workday: workdayRequired(session) });
    }, [canPay, session]),
  );

  const onLogout = () => {
    Alert.alert("Cerrar sesión", "¿Seguro que deseas cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={styles.greeting}>Hola,</Text>
            <Text variant="headlineSmall" style={styles.name}>{fullName}</Text>
            <Text style={styles.date}>{todayLabel}</Text>
          </View>
          <Pressable onPress={onLogout} hitSlop={12}>
            <MaterialCommunityIcons name="logout" size={22} color={COLORS.onGradient} />
          </Pressable>
        </View>
        {(!!tenantName || !!logoUrl) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm }}>
            {!!logoUrl && (
              <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.sm, padding: 3 }}>
                <Image source={{ uri: logoUrl }} style={{ width: 30, height: 30 }} resizeMode="contain" />
              </View>
            )}
            {!!tenantName && <Text style={[styles.date, { marginTop: 0 }]}>{tenantName}</Text>}
          </View>
        )}
        {/* Búsqueda general: abre GlobalSearchScreen (clientes, cédulas,
            créditos y pagos). */}
        <Pressable
          style={styles.searchBar}
          onPress={() => navigation.navigate("GlobalSearch")}
          accessibilityRole="search"
          accessibilityLabel="Buscar cliente, cédula, crédito o pago"
        >
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.muted} />
          <Text style={styles.searchText}>Buscar cliente, cédula, crédito…</Text>
        </Pressable>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {businessDayAlerts.map((a) => (
          <BusinessDayBanner
            key={a.branchId}
            status={a.status}
            branchLabel={multiBranch ? `#${a.branchId}` : undefined}
          />
        ))}
        {canPay && <WorkdayCard />}
        <Text style={styles.sectionTitle}>Accesos rápidos</Text>
        <View style={styles.actionsGrid}>
          {canViewCustomers && (
            <ActionTile
              icon="account-group"
              title="Clientes"
              subtitle="Buscar y ubicar"
              gradient={GRADIENTS.primary}
              onPress={() => navigation.navigate("Clientes")}
            />
          )}
          {canPay && (
            <ActionTile
              icon="cash-fast"
              title="Registrar pago"
              subtitle="Capturar en segundos"
              gradient={GRADIENTS.success}
              onPress={() => navigation.navigate("Pagos")}
            />
          )}
          {canPay && (
            <ActionTile
              icon="map-marker-radius-outline"
              title="Ruta de cobro"
              subtitle={overdueLoans.count > 0 ? `${money(overdueLoans.amount)} en mora` : "Mi cartera de hoy"}
              gradient={GRADIENTS.warning}
              badge={overdueLoans.count}
              onPress={() => navigation.navigate("Pagos", { screen: "ClientPortfolio" })}
            />
          )}
          {canPay && (
            <ActionTile
              icon="chart-line"
              title="Mi productividad"
              subtitle="Cartera, mora y cobros"
              gradient={GRADIENTS.dark}
              onPress={() => navigation.navigate("Productivity")}
            />
          )}
          {canPay && (
            <ActionTile
              icon="cash-register"
              title="Cierre del día"
              subtitle="Cobrado y efectivo a entregar"
              gradient={GRADIENTS.success}
              onPress={() => navigation.navigate("DayClose")}
            />
          )}
          {canSupervise && (
            <ActionTile
              icon="account-supervisor-outline"
              title="Supervisión"
              subtitle="Ranking de cobradores"
              gradient={GRADIENTS.primary}
              onPress={() => navigation.navigate("TeamProductivity")}
            />
          )}
          {canCreateLoan && (
            <ActionTile
              icon="file-document-plus-outline"
              title="Nueva solicitud"
              subtitle="Registrar crédito"
              gradient={GRADIENTS.dark}
              onPress={() => navigation.navigate("Creditos", { screen: "NewLoanRequest" })}
            />
          )}
          {canApprove && (
            <ActionTile
              icon="clipboard-check-outline"
              title="Aprobaciones"
              subtitle="Solicitudes pendientes"
              gradient={GRADIENTS.warning}
              badge={pendingCount}
              onPress={() => navigation.navigate("Creditos", { screen: "ApprovalInbox" })}
            />
          )}
          {pendingSyncCount > 0 && (
            <ActionTile
              icon="cloud-sync-outline"
              title="Sin sincronizar"
              subtitle="Se enviará con señal"
              gradient={GRADIENTS.dark}
              badge={pendingSyncCount}
              onPress={() => navigation.navigate("PendingSync")}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
