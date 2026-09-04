import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import DashboardScreen from "../screens/DashboardScreen";
import CustomerStackNavigator from "./CustomerStackNavigator";
import CreditStackNavigator from "./CreditStackNavigator";
import PaymentsStackNavigator from "./PaymentsStackNavigator";
import MoreScreen from "../screens/MoreScreen";
import AppTabBar from "./AppTabBar";

const Tab = createBottomTabNavigator();

// Los nombres de ruta deben calzar con las llaves del mapa ICONS en
// AppTabBar.js.
export default function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tab.Screen name="Inicio" component={DashboardScreen} />
      <Tab.Screen name="Clientes" component={CustomerStackNavigator} />
      <Tab.Screen name="Creditos" component={CreditStackNavigator} options={{ tabBarLabel: "Créditos" }} />
      <Tab.Screen name="Pagos" component={PaymentsStackNavigator} />
      <Tab.Screen name="Mas" component={MoreScreen} options={{ tabBarLabel: "Más" }} />
    </Tab.Navigator>
  );
}
