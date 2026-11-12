import React, { useContext, useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, ActivityIndicator, IconButton, Button } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getRestructureMethod } from "../api/loanRestructureApi";
import { isNetworkError } from "../api/credimasterClient";
import { COLORS } from "../theme/colors";
import { SPACING } from "../theme/layout";

// Puerta de "Solicitar reestructuración" (dueño, 2026-11-12): cada empresa decide con una política si la reestructuración
// abre un crédito nuevo (otro número, RestructureLoan) o sigue sobre el mismo crédito (modificación, RestructureRequest).
// Las empresas normadas siempre usan el mismo crédito. Esta pantalla consulta el método y reemplaza a sí misma por la
// pantalla correcta, con los mismos datos del crédito.

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  body: { padding: SPACING.lg, gap: SPACING.md },
});

export default function RestructureEntryScreen({ route }) {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError("");
    // Empresa normada: siempre el mismo crédito, sin preguntar al servidor.
    const regulated = session?.tenant?.conami_regulated !== false;
    const go = (screen) => alive && navigation.replace(screen, route.params);
    if (regulated) {
      go("RestructureRequest");
      return () => {
        alive = false;
      };
    }
    getRestructureMethod(session.token)
      .then((res) => go(res?.method === "CREDITO_NUEVO" ? "RestructureLoan" : "RestructureRequest"))
      .catch((e) => {
        if (alive) {
          setError(
            isNetworkError(e)
              ? "Sin conexión: la reestructuración necesita señal. Intente de nuevo cuando tenga internet."
              : e?.message ?? "No se pudo preparar la reestructuración",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [attempt, navigation, route.params, session?.tenant?.conami_regulated, session.token]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Reestructurar crédito</Text>
      </View>
      <View style={styles.body}>
        {error ? (
          <>
            <Text style={{ color: COLORS.muted }}>{error}</Text>
            <Button mode="outlined" onPress={() => setAttempt((n) => n + 1)}>Reintentar</Button>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    </SafeAreaView>
  );
}
