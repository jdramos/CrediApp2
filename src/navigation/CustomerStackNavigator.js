import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CustomerSearchScreen from "../screens/CustomerSearchScreen";
import CustomerDetailScreen from "../screens/CustomerDetailScreen";
import CustomerLocationScreen from "../screens/CustomerLocationScreen";
import LoanDetailScreen from "../screens/LoanDetailScreen";

const Stack = createNativeStackNavigator();

// Pila de la pestaña Clientes: buscar -> perfil del cliente (créditos +
// ubicación) -> detalle de un crédito, montada como una sola pestaña del
// tab bar (ver AppTabs.js).
export default function CustomerStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CustomerSearch"
        component={CustomerSearchScreen}
        options={{ title: "Clientes" }}
      />
      <Stack.Screen
        name="CustomerDetail"
        component={CustomerDetailScreen}
        options={{ title: "Cliente" }}
      />
      <Stack.Screen
        name="CustomerLocation"
        component={CustomerLocationScreen}
        options={{ title: "Ubicación del cliente" }}
      />
      <Stack.Screen
        name="LoanDetail"
        component={LoanDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
