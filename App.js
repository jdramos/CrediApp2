import 'react-native-gesture-handler';
import React from "react";
import { Provider as PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { paperTheme } from './src/theme/paperTheme';
import AppNavigator from "./src/navigation/AppNavigator";
import { SessionProvider } from "./src/auth/SessionContext";
import { SyncProvider } from "./src/offline/SyncProvider";
import PrinterHost from "./src/components/PrinterHost";
import { installCrashLogging, checkPreviousSession } from "./src/utils/crashLog";

// Registro de errores y cierres inesperados (utils/crashLog.js).
installCrashLogging();
checkPreviousSession();

export default function App() {
  return (
    <SafeAreaProvider >
      <KeyboardProvider>
        <PaperProvider theme={paperTheme}>
          <SessionProvider>
            <SyncProvider>
              <AppNavigator />
              <PrinterHost />
            </SyncProvider>
          </SessionProvider>
        </PaperProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}