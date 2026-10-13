import React, { useContext, useEffect, useRef } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { SessionContext } from "../auth/SessionContext";
import LoginScreen from "../screens/LoginScreen";
import PendingSyncScreen from "../screens/PendingSyncScreen";
import ProductivityScreen from "../screens/ProductivityScreen";
import DayCloseScreen from "../screens/DayCloseScreen";
import TeamProductivityScreen from "../screens/TeamProductivityScreen";
import RoutesDayScreen from "../screens/RoutesDayScreen";
import RouteMapScreen from "../screens/RouteMapScreen";
import CollectorDetailScreen from "../screens/CollectorDetailScreen";
import GlobalSearchScreen from "../screens/GlobalSearchScreen";
import AppTabs from "./AppTabs";
import { ActivityIndicator } from "react-native-paper";
import { View } from "react-native";
import { COLORS } from "../theme/colors";
import { handleNotificationResponse } from "../notifications/pushNotifications";

const Stack = createNativeStackNavigator();

export const navigationRef = createNavigationContainerRef();

export default function AppNavigator() {
  const { loadingBoot, session } = useContext(SessionContext);
  const responseListener = useRef();

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
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="App" component={AppTabs} />
            <Stack.Screen name="PendingSync" component={PendingSyncScreen} options={{ presentation: "modal" }} />
            <Stack.Screen name="Productivity" component={ProductivityScreen} />
            <Stack.Screen name="DayClose" component={DayCloseScreen} />
            <Stack.Screen name="TeamProductivity" component={TeamProductivityScreen} />
            <Stack.Screen name="RoutesDay" component={RoutesDayScreen} />
            <Stack.Screen name="RouteMap" component={RouteMapScreen} />
            <Stack.Screen name="CollectorDetail" component={CollectorDetailScreen} />
            <Stack.Screen name="GlobalSearch" component={GlobalSearchScreen} options={{ animation: "fade_from_bottom" }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
