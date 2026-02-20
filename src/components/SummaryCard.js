import React from "react";
import { Card, Text } from "react-native-paper";

export default function SummaryCard({ title, value, subtitle }) {
  return (
    <Card style={{ flex: 1, padding: 12, borderRadius: 16 }}>
      <Text variant="labelLarge" style={{ opacity: 0.75 }}>{title}</Text>
      <Text variant="titleLarge" style={{ fontWeight: "700", marginTop: 6 }}>{value}</Text>
      {!!subtitle && (
        <Text variant="bodySmall" style={{ marginTop: 6, opacity: 0.7 }}>{subtitle}</Text>
      )}
    </Card>
  );
}