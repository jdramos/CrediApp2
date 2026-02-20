import React from "react";
import { View } from "react-native";
import { Card, Text } from "react-native-paper";

export default function NotAuthorizedScreen() {
  return (
    <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
      <Card style={{ padding: 16 }}>
        <Text variant="titleMedium">No autorizado</Text>
        <Text variant="bodyMedium" style={{ marginTop: 8 }}>
          No tienes permisos para ver esta pantalla.
        </Text>
      </Card>
    </View>
  );
}