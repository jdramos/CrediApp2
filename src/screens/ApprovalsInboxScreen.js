import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Card, Text, Button, Divider, Chip } from "react-native-paper";
import { mockApprovalsInbox } from "../api/mockData";
import { money } from "../utils/format";

function statusLabel(s) {
  if (s === "PENDING") return "Pendiente";
  if (s === "PARTIAL_APPROVED") return "Parcial";
  return s;
}

export default function ApprovalsInboxScreen() {
  const [rows, setRows] = useState(mockApprovalsInbox);

  const approveOne = (id) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const pending = Math.max(0, (r.pendingApprovers ?? 0) - 1);
        return { ...r, pendingApprovers: pending, status: pending === 0 ? "APPROVED" : "PARTIAL_APPROVED" };
      })
    );
  };

  const reject = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "REJECTED", pendingApprovers: 0 } : r)));
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ padding: 12, borderRadius: 16 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>Bandeja de aprobaciones</Text>
        <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: 4 }}>
          Simulación: cada “Aprobar” reduce pendientes.
        </Text>
      </Card>

      {rows.map((r) => (
        <Card key={r.id} style={{ padding: 12, borderRadius: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="titleMedium" style={{ fontWeight: "700" }}>{r.customer}</Text>
            <Chip compact>{statusLabel(r.status)}</Chip>
          </View>

          <Divider style={{ marginVertical: 10 }} />

          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text variant="bodyMedium">Monto</Text>
            <Text variant="bodyMedium" style={{ fontWeight: "700" }}>{money(r.amount)}</Text>
          </View>

          <Text variant="bodySmall" style={{ marginTop: 6, opacity: 0.7 }}>
            Pendientes: {r.pendingApprovers}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Button mode="contained" onPress={() => approveOne(r.id)} disabled={r.status === "REJECTED" || r.status === "APPROVED"}>
              Aprobar
            </Button>
            <Button mode="outlined" onPress={() => reject(r.id)} disabled={r.status === "REJECTED" || r.status === "APPROVED"}>
              Rechazar
            </Button>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}