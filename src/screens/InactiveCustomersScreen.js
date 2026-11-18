import React, { useCallback, useContext, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Linking, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Chip, ActivityIndicator } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { listInactiveCustomers } from "../api/inactiveCustomersApi";
import { cachedFetch } from "../offline/cache";
import OfflineNotice from "../components/OfflineNotice";
import { withCode } from "../utils/customerLabel";
import { ymdToDmy } from "../utils/date";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  head: { padding: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.sm },
  input: { backgroundColor: COLORS.card },
  chips: { flexDirection: "row", gap: SPACING.sm },
  list: { padding: SPACING.lg, paddingTop: SPACING.xs, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 4,
    ...SHADOW.card,
  },
  name: { fontWeight: "700", color: COLORS.text },
  sub: { color: COLORS.muted, fontSize: 13 },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  phone: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
});

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// "Lista de inactivos" del Inicio del gestor: clientes que ya terminaron su crédito y no tienen otro, para ofrecerles
// uno nuevo. Un gestor ve los de su cartera; quien supervisa o administra ve los de su alcance. Sin señal, la última
// copia guardada. Un toque en el cliente abre su ficha (con permiso de clientes) y el teléfono llama.
export default function InactiveCustomersScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const canOpenCustomer = session?.permissions?.includes("clientes.ver");
  const collectorId = session?.user?.collector_id || null;
  const userId = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState(null);
  const [onlyEligible, setOnlyEligible] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { data, cachedAt: at } = await cachedFetch(`inactiveCustomers:${userId}`, () =>
        listInactiveCustomers(session.token, collectorId ? { collector_id: collectorId } : {}),
      );
      setRows(data?.data?.rows || []);
      setCachedAt(at);
    } catch (e) {
      setError(e?.message || "No se pudo cargar la lista de clientes inactivos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.token, collectorId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return rows.filter((r) => {
      if (onlyEligible && !r.eligible) return false;
      if (!q) return true;
      return [r.customer_name, r.customer_code, r.identification, r.phone].some((v) => norm(v).includes(q));
    });
  }, [rows, onlyEligible, query]);

  const renderItem = ({ item: r }) => (
    <Pressable
      style={styles.card}
      disabled={!canOpenCustomer}
      onPress={() => navigation.navigate("Clientes", { screen: "CustomerDetail", params: { customerId: r.customer_id } })}
    >
      <Text style={styles.name} numberOfLines={2}>{withCode(r.customer_name, r.customer_code)}</Text>
      <Text style={styles.sub}>
        {r.days_inactive != null ? `Inactivo hace ${r.days_inactive} día${r.days_inactive === 1 ? "" : "s"}` : "Inactivo"}
        {r.last_end_date ? ` · terminó el ${ymdToDmy(r.last_end_date)}` : ""}
      </Text>
      <Text style={styles.sub}>
        Último crédito {money(r.last_amount)}
        {r.last_max_days_late != null ? ` · atraso máx. ${r.last_max_days_late} día${r.last_max_days_late === 1 ? "" : "s"}` : ""}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {r.phone ? (
          <Pressable style={styles.phone} onPress={() => Linking.openURL(`tel:${r.phone}`).catch(() => {})} hitSlop={8}>
            <MaterialCommunityIcons name="phone" size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontWeight: "600" }}>{r.phone}</Text>
          </Pressable>
        ) : (
          <Text style={styles.sub}>Sin teléfono</Text>
        )}
        <Text style={{ color: r.eligible ? COLORS.success : COLORS.warning, fontWeight: "700", fontSize: 12 }}>
          {r.eligible ? "Apto para nuevo crédito" : "No apto"}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.head}>
        <TextInput
          mode="outlined"
          dense
          placeholder="Buscar por nombre, código, cédula o teléfono"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          left={<TextInput.Icon icon="magnify" />}
        />
        <View style={styles.chips}>
          <Chip selected={onlyEligible} onPress={() => setOnlyEligible(true)}>Aptos</Chip>
          <Chip selected={!onlyEligible} onPress={() => setOnlyEligible(false)}>Todos</Chip>
        </View>
        {cachedAt != null && <OfflineNotice cachedAt={cachedAt} />}
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.customer_id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error || (rows.length ? "Ningún cliente coincide con la búsqueda." : "No hay clientes inactivos en tu cartera.")}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
