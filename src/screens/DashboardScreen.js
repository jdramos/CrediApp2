import React, { useContext, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Card, Divider, Text } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { mockSummary } from "../api/mockData";
import SummaryCard from "../components/SummaryCard";
import QuickAction from "../components/QuickAction";
import { money } from "../utils/format";
import { useNavigation } from "@react-navigation/native";

export default function DashboardScreen() {
  const { session } = useContext(SessionContext);
  const [summary] = useState(mockSummary);
  const navigation = useNavigation();

  const welcome = useMemo(() => {
    const name = session?.user?.full_name ?? "Usuario";
    const role = session?.user?.role ?? "";
    return `${name} • ${role}`;
  }, [session]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ padding: 14, borderRadius: 16 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>Resumen</Text>
        <Text variant="bodyMedium" style={{ marginTop: 4, opacity: 0.7 }}>{welcome}</Text>
      </Card>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <SummaryCard
          title="Cobrado hoy"
          value={money(summary.collected_today_amount)}
          subtitle={`${summary.collected_today_count} pagos`}
        />
        <SummaryCard
          title="Aprobaciones"
          value={String(summary.approvals_pending)}
          subtitle="pendientes"
        />
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <SummaryCard
          title="Cartera total"
          value={money(summary.portfolio_total)}
          subtitle="saldo total"
        />
        <SummaryCard
          title="Mora"
          value={money(summary.overdue_amount)}
          subtitle={`${summary.overdue_customers} clientes`}
        />
      </View>

      <Card style={{ padding: 12, borderRadius: 16 }}>
        <Text variant="titleMedium" style={{ fontWeight: "700" }}>Accesos rápidos</Text>
        <Divider style={{ marginVertical: 10 }} />

        <View style={{ gap: 12 }}>
          <QuickAction
            title="Registrar pago"
            subtitle="Captura un pago en segundos"
            buttonText="Ir a Pagos"
            onPress={() => {}}
          />
          <QuickAction
            title="Nueva solicitud"
            subtitle="Registra una solicitud de crédito"
            buttonText="Ir a Solicitudes"
            onPress={() => {}}
          />
        </View>

        <Text variant="labelSmall" style={{ marginTop: 10, opacity: 0.6 }}>
          Nota: los botones navegarán cuando conectemos stacks internos (siguiente paso).
        </Text>
      </Card>
    </ScrollView>
  );
}