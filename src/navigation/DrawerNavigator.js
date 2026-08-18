import React from "react";
import { createDrawerNavigator } from "@react-navigation/drawer";
import DashboardScreen from "../screens/DashboardScreen";
import CreditRequestsScreen from "../screens/CreditRequestsScreen";
import PaymentsScreen from "../screens/PaymentsScreen";
import SaldoDetalleScreen from "../screens/SaldoDetalleScreen";
import CustomerStackNavigator from "./CustomerStackNavigator";

const Drawer = createDrawerNavigator();

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator>
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen
        name="Clientes"
        component={CustomerStackNavigator}
        options={{ headerShown: false }}
      />
      <Drawer.Screen name="CreditRequests" component={CreditRequestsScreen} />
      <Drawer.Screen name="Payments" component={PaymentsScreen} />
      <Drawer.Screen name="Balances" component={SaldoDetalleScreen} />
    </Drawer.Navigator>
  );
}