import React, { useMemo, useState } from "react";
import { StyleSheet, FlatList, Keyboard, useWindowDimensions } from "react-native";
import { Portal, Modal, Text, TextInput, List, Button, Divider } from "react-native-paper";
import { useKeyboardState } from "react-native-keyboard-controller";
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
//
// Teclado: la app se dibuja de borde a borde y el teclado no reduce la ventana, así que un modal
// centrado quedaba con su parte de abajo (la lista) tapada. Al abrir se oculta el teclado y, si el
// usuario escribe en el buscador, el modal se sube y la lista se acorta para quedar sobre el teclado.
export default function CatalogPickerField({ label, value, options, onChange, disabled, allowClear }) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const keyboardHeight = useKeyboardState((s) => (s.isVisible ? s.height : 0));
  const { height: windowHeight } = useWindowDimensions();

  // Alto que queda para la lista: pantalla - teclado - márgenes, título, buscador y botón.
  const listMaxHeight = Math.max(140, Math.min(340, windowHeight - keyboardHeight - 260));
  const open = () => {
    Keyboard.dismiss();
    setVisible(true);
  };

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
        onPress={open}
        disabled={disabled}
        style={styles.trigger}
        contentStyle={{ justifyContent: "flex-start" }}
        icon="chevron-down"
      >
        {selected ? `${label}: ${selected.label}` : label}
      </Button>

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={[styles.modal, { marginBottom: SPACING.lg + keyboardHeight }]}
        >
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
            style={{ maxHeight: listMaxHeight }}
            keyboardShouldPersistTaps="handled"
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
