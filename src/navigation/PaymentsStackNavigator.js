import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PaymentsScreen from "../screens/PaymentsScreen";
import PaymentHistoryScreen from "../screens/PaymentHistoryScreen";
import ClientPortfolioScreen from "../screens/ClientPortfolioScreen";
import AccountStatementScreen from "../screens/AccountStatementScreen";
import LoanActionsScreen from "../screens/LoanActionsScreen";

const Stack = createNativeStackNavigator();

export default function PaymentsStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PaymentsHome" component={PaymentsScreen} />
      <Stack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
      <Stack.Screen name="ClientPortfolio" component={ClientPortfolioScreen} />
      <Stack.Screen name="AccountStatement" component={AccountStatementScreen} />
      <Stack.Screen name="LoanActions" component={LoanActionsScreen} />
    </Stack.Navigator>
  );
}
