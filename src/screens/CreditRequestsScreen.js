import React, { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Card, Text, TextInput, Button, Divider, Chip } from "react-native-paper";
import { mockCreditRequests } from "../api/mockData";
import { money, toNumber } from "../utils/format";

function statusLabel(s) {
  if (s === "PENDING") return "Pendiente";
  if (s === "PARTIAL_APPROVED") return "Parcial";
  if (s === "APPROVED") return "Aprobado";
  if (s === "REJECTED") return "Rechazado";
  return s;
}

export default function CreditRequestsScreen() {
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("12");
  const [rows, setRows] = useState(mockCreditRequests);

  const canSave = useMemo(() => customer.trim().length >= 3 && toNumber(amount) > 0 && toNumber(term) > 0, [customer, amount, term]);

  const onCreate = () => {
    const row = {
      id: Date.now(),
      customer: customer.trim(),
      amount: toNumber(amount),
      term: toNumber(term),
      status: "PENDING",
      pendingApprovers: 2,
    };
    setRows([row, ...rows]);
    setCustomer("");
    setAmount("");
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ padding: 12, borderRadius: 16 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>Nueva solicitud</Text>

        <TextInput label="Cliente" value={customer} onChangeText={setCustomer} style={{ marginTop: 10 }} />
        <TextInput label="Monto solicitado" value={amount} onChangeText={setAmount} keyboardType="numeric" style={{ marginTop: 10 }} />
        <TextInput label="Plazo (meses)" value={term} onChangeText={setTerm} keyboardType="numeric" style={{ marginTop: 10 }} />

        <Button mode="contained" onPress={onCreate} disabled={!canSave} style={{ marginTop: 12, borderRadius: 10 }}>
          Crear solicitud
        </Button>
      </Card>

      <Card style={{ padding: 12, borderRadius: 16 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>Solicitudes</Text>
        <Divider style={{ marginVertical: 10 }} />

        {rows.map((r) => (
          <View key={r.id} style={{ paddingVertical: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="labelLarge" style={{ fontWeight: "700" }}>{r.customer}</Text>
              <Chip compact>{statusLabel(r.status)}</Chip>
            </View>

            <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="bodyMedium">Monto</Text>
              <Text variant="bodyMedium" style={{ fontWeight: "700" }}>{money(r.amount)}</Text>
            </View>

            <View style={{ marginTop: 4, flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="bodyMedium">Plazo</Text>
              <Text variant="bodyMedium" style={{ fontWeight: "700" }}>{r.term} meses</Text>
            </View>

            <Text variant="bodySmall" style={{ marginTop: 4, opacity: 0.7 }}>
              Pendientes: {r.pendingApprovers}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}