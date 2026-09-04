import React, { useEffect } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "react-native-paper";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const ICONS = {
  Inicio: "view-dashboard",
  Clientes: "account-group",
  Creditos: "cash-multiple",
  Pagos: "credit-card-check",
  Mas: "dots-horizontal-circle",
};

// Botón individual de la barra: el "pill" de fondo aparece con un
// resorte (spring) cuando la pestaña queda activa, en vez de un cambio
// brusco de color — es el tipo de detalle que hace que la navegación se
// sienta viva en vez de un menú plano.
function TabButton({ route, label, isFocused, onPress }) {
  const focus = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focus.value = withSpring(isFocused ? 1 : 0, { damping: 14, stiffness: 180 });
  }, [isFocused, focus]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [{ scale: 0.7 + focus.value * 0.3 }],
  }));

  const iconColor = isFocused ? COLORS.primary : COLORS.muted;
  const iconName = ICONS[route.name] || "circle-outline";

  return (
    <Pressable onPress={onPress} style={styles.tabButton} android_ripple={{ color: COLORS.primarySoft, borderless: true }}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.pill, pillStyle]} />
        <MaterialCommunityIcons name={iconName} size={22} color={iconColor} style={{ zIndex: 1 }} />
      </View>
      {isFocused && (
        <Text variant="labelSmall" style={styles.label}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// Barra de pestañas flotante y redondeada (en vez del tab bar plano de
// fábrica) — el patrón visual que distingue una app "moderna" de un
// menú por defecto.
export default function AppTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return <TabButton key={route.key} route={route} label={label} isFocused={isFocused} onPress={onPress} />;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    width: "100%",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xs,
    minHeight: 50,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primarySoft,
  },
  label: {
    color: COLORS.primary,
    fontWeight: "700",
    marginTop: 1,
  },
});
