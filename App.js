import 'react-native-gesture-handler';
import React from "react";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./src/navigation/AppNavigator";
import { SessionProvider } from "./src/auth/SessionContext";

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <SessionProvider>
          <AppNavigator />
        </SessionProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}