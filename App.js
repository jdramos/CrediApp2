import 'react-native-gesture-handler';
import React from "react";
import { Provider as PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { paperTheme } from './src/theme/paperTheme';
import AppNavigator from "./src/navigation/AppNavigator";
import { SessionProvider } from "./src/auth/SessionContext";

export default function App() {
  return (
    <SafeAreaProvider >
      <PaperProvider theme={paperTheme}>
        <SessionProvider>
          <AppNavigator />
        </SessionProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}