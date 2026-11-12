import React, { useContext, useEffect, useRef, useState } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { SessionContext } from "../auth/SessionContext";
import LoginScreen from "../screens/LoginScreen";
import ForcePasswordChangeScreen from "../screens/ForcePasswordChangeScreen";
import PendingSyncScreen from "../screens/PendingSyncScreen";
import ProductivityScreen from "../screens/ProductivityScreen";
import DayCloseScreen from "../screens/DayCloseScreen";
import TeamProductivityScreen from "../screens/TeamProductivityScreen";
import RoutesDayScreen from "../screens/RoutesDayScreen";
import RouteMapScreen from "../screens/RouteMapScreen";
import FinanceScreen from "../screens/FinanceScreen";
import OverdueLoansScreen from "../screens/OverdueLoansScreen";
import CollectorDetailScreen from "../screens/CollectorDetailScreen";
import GlobalSearchScreen from "../screens/GlobalSearchScreen";
import AppTabs from "./AppTabs";
import LocationGate from "../components/LocationGate";
import ScheduleGate from "../components/ScheduleGate";
import { ActivityIndicator } from "react-native-paper";
import { View } from "react-native";
import { COLORS } from "../theme/colors";
import { handleNotificationResponse } from "../notifications/pushNotifications";
import { setCurrentScreen } from "../utils/crashLog";

const Stack = createNativeStackNavigator();

export const navigationRef = createNavigationContainerRef();

export default function AppNavigator() {
  const { loadingBoot, session, passwordChangeRequired } = useContext(SessionContext);
  // Con la contraseña temporal sin cambiar solo existe la pantalla obligatoria (ni pestañas,
  // ni avisos de ubicación u horario encima): no hay forma de llegar a otra.
  const fullApp = !!session && !passwordChangeRequired;
  const responseListener = useRef();
  // Pantalla actual: ScheduleGate deja usar solo algunas fuera del horario de la app.
  const [routeName, setRouteName] = useState(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response, navigationRef);
    });
    return () => responseListener.current?.remove();
  }, []);

  if (loadingBoot) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg }}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <>
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setRouteName(navigationRef.getCurrentRoute()?.name ?? null)}
      onStateChange={() => {
        const name = navigationRef.getCurrentRoute()?.name ?? null;
        setCurrentScreen(name);
        setRouteName(name);
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session && passwordChangeRequired ? (
          <Stack.Screen name="ForcePasswordChange" component={ForcePasswordChangeScreen} options={{ gestureEnabled: false }} />
        ) : session ? (
          <>
            <Stack.Screen name="App" component={AppTabs} />
            <Stack.Screen name="PendingSync" component={PendingSyncScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="Productivity" component={ProductivityScreen} />
            <Stack.Screen name="DayClose" component={DayCloseScreen} />
            <Stack.Screen name="TeamProductivity" component={TeamProductivityScreen} />
            <Stack.Screen name="RoutesDay" component={RoutesDayScreen} />
            <Stack.Screen name="RouteMap" component={RouteMapScreen} />
            <Stack.Screen name="Finance" component={FinanceScreen} />
            <Stack.Screen name="OverdueLoans" component={OverdueLoansScreen} />
            <Stack.Screen name="CollectorDetail" component={CollectorDetailScreen} />
            <Stack.Screen name="GlobalSearch" component={GlobalSearchScreen} options={{ animation: "fade_from_bottom" }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
    {/* Sin ubicación activa no se puede operar: bloquea toda la app (no el login). */}
    {fullApp ? <LocationGate /> : null}
    {/* Fuera del horario de uso de la app (lo define la oficina): solo pendientes y cierre del día. */}
    {fullApp ? <ScheduleGate routeName={routeName} onOpenRoute={(name) => navigationRef.isReady() && navigationRef.navigate(name)} /> : null}
    </>
  );
}
