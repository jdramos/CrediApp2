import React from "react";
import { View } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

export default function NotAuthorizedScreen() {
  const navigation = useNavigation();
  // Guard.js renderiza esto en el lugar de la pantalla bloqueada, así que
  // no hay historial propio que "cerrar" -- volvemos siempre al home del
  // tab actual en vez de goBack() (que podría no tener a dónde ir).
  const goHome = () => navigation.navigate("Inicio");

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
      <Card style={{ padding: 16 }}>
        <Text variant="titleMedium">No autorizado</Text>
        <Text variant="bodyMedium" style={{ marginTop: 8 }}>
          No tienes permisos para ver esta pantalla.
        </Text>
        <Button mode="contained" onPress={goHome} style={{ marginTop: 16 }}>
          Ir al inicio
        </Button>
      </Card>
    </View>
  );
}