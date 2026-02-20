import React from "react";
import { Card, Text, Button } from "react-native-paper";

export default function QuickAction({ title, subtitle, onPress, buttonText }) {
  return (
    <Card style={{ padding: 12, borderRadius: 16 }}>
      <Text variant="titleMedium" style={{ fontWeight: "700" }}>{title}</Text>
      <Text variant="bodyMedium" style={{ marginTop: 4, opacity: 0.7 }}>{subtitle}</Text>
      <Button mode="contained-tonal" onPress={onPress} style={{ marginTop: 10, borderRadius: 10 }}>
        {buttonText}
      </Button>
    </Card>
  );
}