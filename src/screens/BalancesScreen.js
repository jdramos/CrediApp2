import React, { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Card, Text, TextInput, Chip } from "react-native-paper";
import { mockBalances } from "../api/mockData";
import { money } from "../utils/format";

export default function BalancesScreen() {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return mockBalances;
    return mockBalances.filter(
      (r) =>
        r.customer.toLowerCase().includes(s) ||
        r.identification.toLowerCase().includes(s) ||
        r.branch.toLowerCase().includes(s)
    );
  }, [q]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <TextInput
        label="Buscar cliente / cédula / sucursal"
        value={q}
        onChangeText={setQ}
        style={{ borderRadius: 12 }}
      />

      {rows.map((r) => (
        <Card key={r.id} style={{ padding: 12, borderRadius: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="titleMedium" style={{ fontWeight: "700" }}>{r.customer}</Text>
            <Chip compact>{r.branch}</Chip>
          </View>

          <Text variant="bodySmall" style={{ marginTop: 4, opacity: 0.7 }}>
            {r.identification}
          </Text>

          <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="labelLarge">Saldo</Text>
            <Text variant="labelLarge" style={{ fontWeight: "700" }}>{money(r.saldoTotal)}</Text>
          </View>

          <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="labelLarge">Mora</Text>
            <Text variant="labelLarge" style={{ fontWeight: "700" }}>{money(r.mora)}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}