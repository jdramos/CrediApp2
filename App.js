import 'react-native-gesture-handler';
import React from "react";
import { Provider as PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { paperTheme } from './src/theme/paperTheme';
import AppNavigator from "./src/navigation/AppNavigator";
import { SessionProvider } from "./src/auth/SessionContext";
import { SyncProvider } from "./src/offline/SyncProvider";

export default function App() {
  return (
    <SafeAreaProvider >
      <PaperProvider theme={paperTheme}>
        <SessionProvider>
          <SyncProvider>
            <AppNavigator />
          </SyncProvider>
        </SessionProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}