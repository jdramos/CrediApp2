import React, { useContext, useMemo, useState, useLayoutEffect, useEffect } from "react";
import { ScrollView, View, KeyboardAvoidingView, Platform, Alert } from "react-native";
import {
  Card,
  Divider,
  Text,
  TextInput,
  Button,
  Portal,
  Modal,
  IconButton,
  Chip
} from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { SessionContext } from "../auth/SessionContext";
import { mockSummary } from "../api/mockData";
import SummaryCard from "../components/SummaryCard";
import QuickAction from "../components/QuickAction";
import { money } from "../utils/format";
import { todayISO } from "../utils/date";

// ---- helpers fecha
function isoToDate(iso) {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function dateToISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysISO(iso, deltaDays) {
  const dt = isoToDate(iso);
  dt.setDate(dt.getDate() + deltaDays);
  return dateToISO(dt);
}

function monthRangeISO(iso) {
  const dt = isoToDate(iso);
  const y = dt.getFullYear();
  const m = dt.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return { start: dateToISO(start), end: dateToISO(end) };
}

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const { signOut } = useContext(SessionContext);

  // ✅ filtros
  const [date, setDate] = useState(todayISO());
  const [branch, setBranch] = useState("Todas");

  // ✅ para debounce de sucursal (evita refrescos mientras escribís)
  const [branchInput, setBranchInput] = useState("Todas");

  // ✅ DatePicker
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ✅ summary
  const [summary, setSummary] = useState(mockSummary);

  const welcome = useMemo(() => {
    const name = session?.user?.full_name ?? "Usuario";
    const role = session?.user?.role ?? "";
    return `${name} • ${role}`;
  }, [session]);

  // ✅ Botón filtro y logout en header
useLayoutEffect(() => {
  navigation.setOptions({
    headerRight: () => (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <IconButton
          icon="filter-variant"
          onPress={() => setFiltersVisible(true)}
        />
        <IconButton
          icon="logout"
          onPress={() => {
            Alert.alert(
              "Cerrar sesión",
              "¿Seguro que deseas cerrar sesión?",
              [
                { text: "Cancelar", style: "cancel" },
                { text: "Cerrar sesión", style: "destructive", onPress: signOut },
              ]
            );
          }}
        />
      </View>
    ),
  });
}, [navigation, signOut]);

  // ✅ Simula fetch real (aquí luego va tu endpoint)
  const fetchSummary = async (params) => {
    // params: { date, branch }


    // Aquí luego: GET /api/summary?date=...&branch=...
    // Por ahora dejamos el mock (puedes ajustarlo si quieres simular cambios)
    setSummary((prev) => ({ ...prev }));
  };

  // ✅ Debounce: aplica branchInput -> branch luego de 400ms sin teclear
  useEffect(() => {
    const t = setTimeout(() => {
      setBranch(branchInput || "Todas");
    }, 400);
    return () => clearTimeout(t);
  }, [branchInput]);

  // ✅ AUTO-REFRESH: cuando cambie date o branch, refrescar summary
  useEffect(() => {
    fetchSummary({ date, branch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, branch]);

  const resetFilters = () => {
    const t = todayISO();
    setDate(t);
    setBranchInput("Todas");
    setBranch("Todas");
  };

  const quickToday = () => setDate(todayISO());
  const quickYesterday = () => setDate(addDaysISO(todayISO(), -1));
  const quickThisMonth = () => {
    const { start } = monthRangeISO(todayISO());
    // Para el dashboard de “día” usamos el inicio de mes como filtro principal,
    // y luego más adelante podemos habilitar rango (start/end).
    setDate(start);
  };

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Card style={{ padding: 14, borderRadius: 16 }}>
          <Text variant="titleMedium" style={{ fontWeight: "700" }}>
            Resumen
          </Text>
          <Text variant="bodyMedium" style={{ marginTop: 4, opacity: 0.7 }}>
            {welcome}
          </Text>

          <Text variant="labelSmall" style={{ marginTop: 8, opacity: 0.65 }}>
            Filtros: {date} • {branch}
          </Text>
        </Card>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <SummaryCard
            title="Cobrado"
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
          <Text variant="titleMedium" style={{ fontWeight: "700" }}>
            Accesos rápidos
          </Text>
          <Divider style={{ marginVertical: 10 }} />

          <View style={{ gap: 12 }}>
            <QuickAction
              title="Registrar pago"
              subtitle="Captura un pago en segundos"
              buttonText="Ir a Pagos"
              onPress={() => navigation.navigate("Payments")}
            />
             <QuickAction
              title="Saldos "
              subtitle="Ve saldos"
              buttonText="Ir a lista de saldos"
              onPress={() => navigation.navigate("Balances")}
            />

            <QuickAction
              title="Nueva solicitud"
              subtitle="Registra una solicitud de crédito"
              buttonText="Ir a Solicitudes"
              onPress={() => navigation.navigate("CreditRequests")}
            />
          </View>
        </Card>
      </ScrollView>

      {/* ✅ Bottom Sheet */}
      <Portal>
        <Modal
          visible={filtersVisible}
          onDismiss={() => setFiltersVisible(false)}
          dismissable
          contentContainerStyle={{
            flex: 1,
            justifyContent: "flex-end",
            margin: 0,
            padding: 0,
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View
              style={{
                backgroundColor: "white",
                padding: 16,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
              }}
            >
              {/* handle */}
              <View
                style={{
                  alignSelf: "center",
                  width: 44,
                  height: 5,
                  borderRadius: 10,
                  opacity: 0.25,
                  backgroundColor: "#000",
                  marginBottom: 12,
                }}
              />

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                  Filtros
                </Text>
                <IconButton icon="close" onPress={() => setFiltersVisible(false)} />
              </View>

              {/* ✅ chips rápidos */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                <Chip onPress={quickToday}>Hoy</Chip>
                <Chip onPress={quickYesterday}>Ayer</Chip>
                <Chip onPress={quickThisMonth}>Este mes</Chip>
                <Chip onPress={resetFilters}>Reset</Chip>
              </View>

              {/* ✅ selector de fecha (abre calendario) */}
              <Card style={{ marginTop: 12, borderRadius: 12 }}>
                <Button
                  mode="text"
                  onPress={() => setShowDatePicker(true)}
                  contentStyle={{ justifyContent: "flex-start" }}
                >
                  📅 Fecha: {date}
                </Button>
              </Card>

              {showDatePicker && (
                <DateTimePicker
                  value={isoToDate(date)}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    // En Android, al cancelar selectedDate viene undefined
                    setShowDatePicker(false);
                    if (selectedDate) setDate(dateToISO(selectedDate));
                  }}
                />
              )}

              {/* ✅ sucursal (debounced) */}
              <TextInput
                label="Sucursal"
                value={branchInput}
                onChangeText={setBranchInput}
                style={{ marginTop: 12 }}
              />

              <Text variant="labelSmall" style={{ marginTop: 8, opacity: 0.65 }}>
                * Se actualiza automáticamente al cambiar fecha o sucursal.
              </Text>

              <Button mode="text" onPress={() => setFiltersVisible(false)} style={{ marginTop: 6 }}>
                Cerrar
              </Button>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>
    </>
  );
}