import React, { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Card, Text, TextInput, Button, Divider } from "react-native-paper";
import { mockPayments } from "../api/mockData";
import { money, toNumber } from "../utils/format";
import { todayISO } from "../utils/date";

export default function PaymentsScreen() {
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Efectivo");
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState(mockPayments);

  const canSave = useMemo(() => {
    return customer.trim().length >= 3 && toNumber(amount) > 0;
  }, [customer, amount]);

  const onSave = () => {
    const newRow = {
      id: Date.now(),
      customer: customer.trim(),
      amount: toNumber(amount),
      method,
      date,
    };
    setRows([newRow, ...rows]);
    setCustomer("");
    setAmount("");
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ padding: 12, borderRadius: 16 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>Registrar pago</Text>

        <TextInput label="Cliente" value={customer} onChangeText={setCustomer} style={{ marginTop: 10 }} />
        <TextInput
          label="Monto"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          style={{ marginTop: 10 }}
        />
        <TextInput label="Método" value={method} onChangeText={setMethod} style={{ marginTop: 10 }} />
        <TextInput label="Fecha" value={date} onChangeText={setDate} style={{ marginTop: 10 }} />

        <Button
          mode="contained"
          onPress={onSave}
          disabled={!canSave}
          style={{ marginTop: 12, borderRadius: 10 }}
        >
          Guardar pago
        </Button>
      </Card>

      <Card style={{ padding: 12, borderRadius: 16 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>Historial</Text>
        <Divider style={{ marginVertical: 10 }} />

        {rows.map((p) => (
          <View key={p.id} style={{ paddingVertical: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="labelLarge" style={{ fontWeight: "700" }}>{p.customer}</Text>
              <Text variant="labelLarge">{money(p.amount)}</Text>
            </View>
            <Text variant="bodySmall" style={{ opacity: 0.7 }}>
              {p.date} • {p.method}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}