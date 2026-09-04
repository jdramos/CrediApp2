import React, { useMemo, useState } from "react";
import { StyleSheet, FlatList } from "react-native";
import { Portal, Modal, Text, TextInput, List, Button, Divider } from "react-native-paper";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  modal: {
    backgroundColor: COLORS.card,
    margin: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    maxHeight: "80%",
  },
  trigger: { borderRadius: RADIUS.md, marginTop: SPACING.sm, justifyContent: "flex-start" },
});

// Selector genérico para catálogos largos (tipo de crédito, destino,
// línea, etc.) — un botón que abre una lista buscable en un modal, en
// vez de intentar meter 10-20 opciones en chips horizontales.
export default function CatalogPickerField({ label, value, options, onChange, disabled, allowClear }) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => String(o.id) === String(value));

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => (o.label || "").toLowerCase().includes(q));
  }, [query, options]);

  return (
    <>
      <Button
        mode="outlined"
        onPress={() => setVisible(true)}
        disabled={disabled}
        style={styles.trigger}
        contentStyle={{ justifyContent: "flex-start" }}
        icon="chevron-down"
      >
        {selected ? `${label}: ${selected.label}` : label}
      </Button>

      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
          <Text variant="titleMedium" style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm }}>
            {label}
          </Text>
          {options.length > 8 && (
            <TextInput
              mode="outlined"
              placeholder="Buscar..."
              value={query}
              onChangeText={setQuery}
              style={{ backgroundColor: COLORS.card, marginBottom: SPACING.sm }}
              outlineStyle={{ borderRadius: RADIUS.md }}
              left={<TextInput.Icon icon="magnify" />}
            />
          )}
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            style={{ maxHeight: 340 }}
            ItemSeparatorComponent={() => <Divider />}
            ListEmptyComponent={<Text style={{ color: COLORS.muted, padding: SPACING.md }}>Sin opciones</Text>}
            renderItem={({ item }) => (
              <List.Item
                title={item.label}
                onPress={() => {
                  onChange(item.id);
                  setVisible(false);
                  setQuery("");
                }}
                right={(props) =>
                  String(item.id) === String(value) ? (
                    <List.Icon {...props} icon="check" color={COLORS.primary} />
                  ) : null
                }
              />
            )}
          />
          {allowClear && value != null && (
            <Button onPress={() => { onChange(null); setVisible(false); }} textColor={COLORS.danger}>
              Quitar selección
            </Button>
          )}
        </Modal>
      </Portal>
    </>
  );
}
