import React, { useContext, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Card, ActivityIndicator, HelperText } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";
import { searchCustomers } from "../api/customerApi";
import AddressLines from "../components/AddressLines";
import { COLORS } from "../theme/colors";
import CopyableId from "../components/CopyableId";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg, padding: SPACING.lg },
  input: { backgroundColor: COLORS.card },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    ...SHADOW.card,
  },
  name: { fontWeight: "700", color: COLORS.text },
  id: { color: COLORS.muted, marginTop: 2 },
  empty: { marginTop: SPACING.lg, textAlign: "center", color: COLORS.muted },
});

// Búsqueda de clientes: entrada a su perfil (créditos activos +
// ubicación GPS de casa/negocio). Requiere el permiso clientes.ver en
// CrediMaster (verificado por el backend, no por esta pantalla — un
// usuario sin ese permiso simplemente recibe un 403 al buscar).
export default function CustomerSearchScreen({ navigation }) {
  const { session } = useContext(SessionContext);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onChangeQuery = async (text) => {
    setQuery(text);
    setError("");

    if (text.trim().length < 2) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const res = await searchCustomers(session.token, text.trim());
      setResults(res?.data || []);
    } catch (e) {
      setError(e?.message ?? "Error buscando clientes");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Text variant="headlineSmall" style={{ fontWeight: "800", color: COLORS.text }}>
        Clientes
      </Text>
      <Text variant="bodyMedium" style={{ color: COLORS.muted, marginTop: 2, marginBottom: SPACING.md }}>
        Busque un cliente para ver sus créditos y ubicación.
      </Text>

      <TextInput
        mode="outlined"
        label="Nombre o cédula"
        value={query}
        onChangeText={onChangeQuery}
        autoCapitalize="none"
        style={styles.input}
        outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
        left={<TextInput.Icon icon="magnify" />}
      />

      <HelperText type="error" visible={!!error}>
        {error}
      </HelperText>

      {loading && <ActivityIndicator style={{ marginTop: SPACING.md }} />}

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListEmptyComponent={
          !loading && query.trim().length >= 2 ? (
            <Text style={styles.empty}>Sin resultados</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            style={styles.row}
            onPress={() => navigation.navigate("CustomerDetail", { customerId: item.id })}
          >
            <Text style={styles.name}>{item.customer_name}</Text>
            <CopyableId label="Cédula: " value={item.identification} textStyle={styles.id} />
            <AddressLines customer={item} />
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
