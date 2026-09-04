import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CreditsHomeScreen from "../screens/CreditsHomeScreen";
import NewLoanRequestScreen from "../screens/NewLoanRequestScreen";
import ApprovalInboxScreen from "../screens/ApprovalInboxScreen";
import ApprovalDecisionScreen from "../screens/ApprovalDecisionScreen";
import MyLoanRequestsScreen from "../screens/MyLoanRequestsScreen";
import LoanDetailScreen from "../screens/LoanDetailScreen";
import PendingDeliveriesScreen from "../screens/PendingDeliveriesScreen";

const Stack = createNativeStackNavigator();

export default function CreditStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CreditsHome" component={CreditsHomeScreen} />
      <Stack.Screen name="NewLoanRequest" component={NewLoanRequestScreen} />
      <Stack.Screen name="ApprovalInbox" component={ApprovalInboxScreen} />
      <Stack.Screen name="ApprovalDecision" component={ApprovalDecisionScreen} />
      <Stack.Screen name="MyLoanRequests" component={MyLoanRequestsScreen} />
      <Stack.Screen name="LoanDetail" component={LoanDetailScreen} />
      <Stack.Screen name="PendingDeliveries" component={PendingDeliveriesScreen} />
    </Stack.Navigator>
  );
}
