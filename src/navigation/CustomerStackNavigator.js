import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CustomerSearchScreen from "../screens/CustomerSearchScreen";
import CustomerDetailScreen from "../screens/CustomerDetailScreen";
import CustomerLocationScreen from "../screens/CustomerLocationScreen";
import CustomerFileScreen from "../screens/CustomerFileScreen";
import CustomerInfoUpdateScreen from "../screens/CustomerInfoUpdateScreen";
import NewCustomerScreen from "../screens/NewCustomerScreen";
import CustomerCreditHistoryScreen from "../screens/CustomerCreditHistoryScreen";
import CustomerSetupScreen from "../screens/CustomerSetupScreen";
import CustomerEvaluationScreen from "../screens/CustomerEvaluationScreen";
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
        name="CustomerFile"
        component={CustomerFileScreen}
        options={{ title: "Expediente y garantías" }}
      />
      <Stack.Screen
        name="CustomerInfoUpdate"
        component={CustomerInfoUpdateScreen}
        options={{ title: "Actualizar expediente" }}
      />
      <Stack.Screen
        name="NewCustomer"
        component={NewCustomerScreen}
        options={{ title: "Nuevo cliente" }}
      />
      <Stack.Screen
        name="CustomerEdit"
        component={NewCustomerScreen}
        options={{ title: "Editar cliente" }}
      />
      <Stack.Screen
        name="CustomerCreditHistory"
        component={CustomerCreditHistoryScreen}
        options={{ title: "Historial crediticio" }}
      />
      <Stack.Screen
        name="CustomerSetup"
        component={CustomerSetupScreen}
        options={{ title: "Completar expediente" }}
      />
      <Stack.Screen
        name="CustomerEvaluation"
        component={CustomerEvaluationScreen}
        options={{ title: "Evaluación financiera" }}
      />
      <Stack.Screen
        name="LoanDetail"
        component={LoanDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
