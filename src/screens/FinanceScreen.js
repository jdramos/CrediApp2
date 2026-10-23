import React, { useContext, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, IconButton, Chip } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import PortfolioTab from "./finance/PortfolioTab";
import ManagementTab from "./finance/ManagementTab";
import IndicatorsTab from "./finance/IndicatorsTab";
import PositionTab from "./finance/PositionTab";
import BudgetTab from "./finance/BudgetTab";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  heroTop: { flexDirection: "row", alignItems: "center", marginLeft: -SPACING.sm },
  heroTitle: { color: COLORS.onGradient, fontWeight: "800", flex: 1 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.xs },
});

// Secciones y el permiso que pide cada una: son los mismos de la plataforma web
// (balances.ver para saldos de cartera; contabilidad.ver para indicadores y
// situación financiera), y el servidor los vuelve a exigir en cada consulta.
const SECTIONS = [
  { key: "portfolio", label: "Cartera", icon: "wallet-outline", permission: "balances.ver", Component: PortfolioTab },
  { key: "management", label: "Gestión del mes", icon: "chart-timeline-variant", permission: "balances.ver", Component: ManagementTab },
  { key: "indicators", label: "Indicadores", icon: "speedometer", permission: "contabilidad.ver", Component: IndicatorsTab },
  { key: "position", label: "Situación financiera", icon: "scale-balance", permission: "contabilidad.ver", Component: PositionTab },
  { key: "budget", label: "Presupuesto", icon: "calculator-variant-outline", permission: "presupuesto.ver", Component: BudgetTab },
];

export const financeSectionsFor = (permissions) => SECTIONS.filter((s) => permissions?.includes(s.permission));

// Finanzas: saldos de cartera, indicadores y situación financiera, para quien
// tenga el permiso de cada sección. Solo se muestran las secciones permitidas.
export default function FinanceScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const allowed = financeSectionsFor(session?.permissions);
  const [active, setActive] = useState(allowed[0]?.key);
  const current = allowed.find((s) => s.key === active) || allowed[0];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <LinearGradient colors={GRADIENTS.dark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <IconButton icon="arrow-left" iconColor={COLORS.onGradient} onPress={() => navigation.goBack()} />
          <Text variant="titleLarge" style={styles.heroTitle}>Finanzas</Text>
        </View>
        {allowed.length > 1 && (
          <View style={styles.tabs}>
            {allowed.map((s) => (
              <Chip
                key={s.key}
                icon={s.icon}
                compact
                selected={current?.key === s.key}
                showSelectedCheck={false}
                onPress={() => setActive(s.key)}
              >
                {s.label}
              </Chip>
            ))}
          </View>
        )}
      </LinearGradient>

      {current ? (
        <current.Component />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl }}>
          <MaterialCommunityIcons name="lock-outline" size={48} color={COLORS.muted} />
          <Text style={{ marginTop: SPACING.md, color: COLORS.muted, textAlign: "center" }}>
            No tenés permiso para ver las finanzas de la empresa.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
