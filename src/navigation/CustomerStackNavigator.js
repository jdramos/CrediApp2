import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CustomerSearchScreen from "../screens/CustomerSearchScreen";
import CustomerLocationScreen from "../screens/CustomerLocationScreen";

const Stack = createNativeStackNavigator();

// Pila propia para el flujo Buscar cliente -> Capturar ubicación,
// montada como una sola pantalla del Drawer (ver DrawerNavigator.js).
export default function CustomerStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CustomerSearch"
        component={CustomerSearchScreen}
        options={{ title: "Ubicación de clientes" }}
      />
      <Stack.Screen
        name="CustomerLocation"
        component={CustomerLocationScreen}
        options={{ title: "Ubicación del cliente" }}
      />
    </Stack.Navigator>
  );
}
