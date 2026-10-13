import React, { useContext, useEffect, useRef, useState } from "react";
import { View, StyleSheet, SectionList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, ActivityIndicator } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SessionContext } from "../auth/SessionContext";
import { globalSearch } from "../api/searchApi";
import { isNetworkError } from "../api/credimasterClient";
import { money } from "../utils/format";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// Búsqueda general: un solo campo para encontrar clientes (nombre, cédula
// con o sin guiones, código, teléfono), créditos (número, código, cliente)
// y pagos (número de pago). Requiere conexión -- consulta al servidor, que
// aplica los mismos permisos y sucursales que la web.

const LOAN_STATUS = {
  PENDING: { label: "En revisión", color: COLORS.warning, bg: COLORS.warningSoft },
  APPROVED: { label: "Aprobado", color: COLORS.success, bg: COLORS.successSoft },
  A: { label: "Aprobado", color: COLORS.success, bg: COLORS.successSoft },
  REJECTED: { label: "Rechazado", color: COLORS.danger, bg: COLORS.dangerSoft },
  DISBURSED: { label: "Desembolsado", color: COLORS.primary, bg: COLORS.primarySoft },
  CANCELLED: { label: "Cancelado", color: COLORS.muted, bg: COLORS.bg },
  DRAFT: { label: "Borrador", color: COLORS.warning, bg: COLORS.warningSoft },
  WRITTEN_OFF: { label: "Castigado", color: COLORS.danger, bg: COLORS.dangerSoft },
};

const ICONS = { customer: "account", loan: "cash-multiple", payment: "receipt" };

const describe = (type, it) => {
  switch (type) {
    case "customer":
      return {
        primary: it.customer_name,
        secondary: [it.identification && `Cédula ${it.identification}`, it.cellphone && `Tel. ${it.cellphone}`]
          .filter(Boolean)
          .join(" · "),
        chip:
          it.active_loans > 0
            ? { label: `${it.active_loans} activo(s)`, color: COLORS.primary, bg: COLORS.primarySoft }
            : null,
      };
    case "loan":
      return {
        primary: `Crédito #${it.credit_code || it.id}`,
        secondary: [it.customer_name, `Saldo ${money(it.current_balance)}`].filter(Boolean).join(" · "),
        chip: LOAN_STATUS[it.status] || { label: it.status, color: COLORS.muted, bg: COLORS.bg },
      };
    case "payment":
      return {
        primary: `Pago #${it.id} — ${money(it.total)}`,
        secondary: [it.customer_name, String(it.payment_date || "").slice(0, 10), `Crédito #${it.loan_id}`]
          .filter(Boolean)
          .join(" · "),
        chip:
          it.payment_status === "A"
            ? { label: "Activo", color: COLORS.success, bg: COLORS.successSoft }
            : { label: "Anulado", color: COLORS.muted, bg: COLORS.bg },
      };
    default:
      return { primary: "", secondary: "" };
  }
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.lg, paddingBottom: SPACING.sm },
  input: { flex: 1, backgroundColor: COLORS.card },
  section: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { fontWeight: "700", color: COLORS.text },
  secondary: { color: COLORS.muted, marginTop: 2, fontSize: 12.5 },
  chip: { borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: "800" },
  message: { marginTop: SPACING.xl, textAlign: "center", color: COLORS.muted, paddingHorizontal: SPACING.lg },
  error: { marginTop: SPACING.xl, textAlign: "center", color: COLORS.danger, paddingHorizontal: SPACING.lg },
});

export default function GlobalSearchScreen({ navigation }) {
  const { session } = useContext(SessionContext);
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seqRef = useRef(0);

  // Espera 300 ms a que el usuario deje de escribir; descarta respuestas viejas.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      seqRef.current += 1;
      setSections([]);
      setLoading(false);
      setError("");
      return undefined;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    const t = setTimeout(async () => {
      try {
        const res = await globalSearch(session.token, q);
        if (seq !== seqRef.current) return;
        setSections((res?.groups || []).map((g) => ({ title: g.label, type: g.type, data: g.items })));
        setError("");
      } catch (e) {
        if (seq !== seqRef.current) return;
        setSections([]);
        setError(
          isNetworkError(e)
            ? "Sin conexión. La búsqueda general necesita internet."
            : e?.message || "No se pudo realizar la búsqueda.",
        );
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, session.token]);

  // Las pantallas de destino viven dentro de las pestañas; initial:false
  // deja la pantalla principal de la pestaña debajo para que "atrás" funcione.
  const open = (type, item) => {
    if (type === "customer") {
      navigation.navigate("App", {
        screen: "Clientes",
        params: { screen: "CustomerDetail", params: { customerId: item.id }, initial: false },
      });
    } else {
      const loanId = type === "payment" ? item.loan_id : item.id;
      navigation.navigate("App", {
        screen: "Creditos",
        params: { screen: "LoanDetail", params: { loanId }, initial: false },
      });
    }
  };

  const q = query.trim();
  let emptyMessage = null;
  if (!loading && !error) {
    emptyMessage =
      q.length < 2
        ? "Escriba al menos 2 letras o números: nombre, cédula (con o sin guiones), número de crédito o de pago."
        : `Sin resultados para “${q}”.`;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Volver">
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </Pressable>
        <TextInput
          mode="outlined"
          placeholder="Cliente, cédula, crédito o pago"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
          outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
          left={<TextInput.Icon icon="magnify" />}
          right={
            loading ? (
              <TextInput.Icon icon={() => <ActivityIndicator size={18} />} />
            ) : query ? (
              <TextInput.Icon icon="close" onPress={() => setQuery("")} accessibilityLabel="Borrar búsqueda" />
            ) : null
          }
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 110 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        ListEmptyComponent={
          error ? <Text style={styles.error}>{error}</Text> : emptyMessage ? <Text style={styles.message}>{emptyMessage}</Text> : null
        }
        renderItem={({ item, section }) => {
          const d = describe(section.type, item);
          return (
            <Pressable style={styles.row} onPress={() => open(section.type, item)}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name={ICONS[section.type]} size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.primary} numberOfLines={1}>
                  {d.primary}
                </Text>
                {!!d.secondary && (
                  <Text style={styles.secondary} numberOfLines={1}>
                    {d.secondary}
                  </Text>
                )}
              </View>
              {d.chip && (
                <View style={[styles.chip, { backgroundColor: d.chip.bg }]}>
                  <Text style={[styles.chipText, { color: d.chip.color }]}>{d.chip.label}</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
