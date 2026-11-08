import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Linking, ScrollView } from "react-native";
import { Text, Button, Portal, Modal, RadioButton, Checkbox, HelperText, Chip, ActivityIndicator } from "react-native-paper";
import {
  ensureBluetoothReady,
  forgetPrinter,
  getPairedPrinters,
  getSavedPrinter,
  isPrinterFeatureAvailable,
  printTestTicket,
  savePrinter,
  setPrinterPickerHost,
} from "../utils/printer";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "90%" },
  title: { fontWeight: "800", color: COLORS.text },
  hint: { color: COLORS.muted, marginTop: SPACING.xs },
  list: { marginTop: SPACING.sm, maxHeight: 240 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, marginTop: SPACING.sm },
});

// Ventana para elegir y probar la impresora Bluetooth. Se monta una sola vez en App.js y se abre
// desde cualquier parte con openPrinterPicker() (printer.js): al tocar "Imprimir" sin impresora
// guardada, o desde Más > Impresora Bluetooth. Resuelve con la impresora elegida o null.
export default function PrinterHost() {
  const [visible, setVisible] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [accents, setAccents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const resolver = useRef(null);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await ensureBluetoothReady();
      setDevices(getPairedPrinters());
    } catch (e) {
      setDevices([]);
      setError(e?.message || "No se pudo leer la lista de dispositivos Bluetooth.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPrinterPickerHost(
      () =>
        new Promise((resolve) => {
          resolver.current?.(null); // si había uno abierto, se cierra
          resolver.current = resolve;
          setInfo("");
          setError("");
          setVisible(true);
          getSavedPrinter().then((saved) => {
            setSelected(saved?.address || null);
            setAccents(!!saved?.accents);
          });
          refresh();
        }),
    );
    return () => setPrinterPickerHost(null);
  }, [refresh]);

  const close = (result) => {
    setVisible(false);
    resolver.current?.(result);
    resolver.current = null;
  };

  const chosen = () => {
    const d = devices.find((x) => x.address === selected);
    return d ? { address: d.address, name: d.name, accents } : null;
  };

  const onSave = async () => {
    const printer = chosen();
    if (!printer) {
      setError("Elija una impresora de la lista.");
      return;
    }
    await savePrinter(printer);
    close(printer);
  };

  const onTest = async () => {
    const printer = chosen();
    if (!printer) {
      setError("Elija una impresora de la lista.");
      return;
    }
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await printTestTicket(printer);
      setInfo("Prueba enviada. Si salió bien, toque Guardar. Si las tildes salen raras, desmarque «Imprimir con tildes».");
    } catch (e) {
      setError(e?.message || "No se pudo imprimir la prueba.");
    } finally {
      setBusy(false);
    }
  };

  const onForget = async () => {
    await forgetPrinter();
    setSelected(null);
    setInfo("Impresora olvidada.");
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={() => close(null)} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>Impresora Bluetooth</Text>
        {!isPrinterFeatureAvailable() ? (
          <Text style={styles.hint}>
            Esta versión de la app no puede imprimir por Bluetooth. Instale la versión más reciente de CrediApp en un teléfono Android.
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.hint}>
              1) Encienda la impresora y empárejela en los ajustes de Bluetooth del teléfono (el PIN suele ser 0000 o 1234).{"\n"}
              2) Vuelva aquí y elíjala de la lista.
            </Text>

            {loading ? (
              <ActivityIndicator style={{ marginTop: SPACING.md }} />
            ) : devices.length === 0 ? (
              <Text style={[styles.hint, { color: COLORS.warning }]}>
                No hay dispositivos emparejados. Empareje la impresora y toque «Actualizar».
              </Text>
            ) : (
              <RadioButton.Group onValueChange={setSelected} value={selected || ""}>
                <ScrollView style={styles.list} nestedScrollEnabled>
                  {devices.map((d) => (
                    <View key={d.address} style={styles.row}>
                      <RadioButton value={d.address} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.text, fontWeight: "600" }}>{d.name}</Text>
                        <Text style={{ color: COLORS.muted, fontSize: 11 }}>{d.address}</Text>
                      </View>
                      {d.isPrinter && <Chip compact>Impresora</Chip>}
                    </View>
                  ))}
                </ScrollView>
              </RadioButton.Group>
            )}

            <Checkbox.Item
              label="Imprimir con tildes y ñ"
              status={accents ? "checked" : "unchecked"}
              onPress={() => setAccents(!accents)}
              position="leading"
              style={{ paddingHorizontal: 0 }}
              labelStyle={{ textAlign: "left", color: COLORS.text }}
            />
            <Text style={[styles.hint, { marginTop: 0 }]}>
              Déjelo desmarcado si la impresora imprime símbolos raros; los recibos salen igual, sin tildes.
            </Text>

            <HelperText type="error" visible={!!error}>{error}</HelperText>
            {!!info && <Text style={{ color: COLORS.success, marginBottom: SPACING.xs }}>{info}</Text>}

            <View style={styles.actions}>
              <Button compact mode="outlined" icon="bluetooth-settings" onPress={() => Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS").catch(() => Linking.openSettings())}>
                Ajustes de Bluetooth
              </Button>
              <Button compact mode="outlined" icon="refresh" onPress={refresh} disabled={loading}>
                Actualizar
              </Button>
              <Button compact mode="outlined" icon="printer-check" onPress={onTest} loading={busy} disabled={busy || !selected}>
                Probar impresión
              </Button>
              <Button compact mode="text" textColor={COLORS.danger} onPress={onForget} disabled={busy}>
                Olvidar impresora
              </Button>
            </View>
          </ScrollView>
        )}

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: SPACING.xs, marginTop: SPACING.sm }}>
          <Button onPress={() => close(null)} disabled={busy}>Cerrar</Button>
          {isPrinterFeatureAvailable() && (
            <Button mode="contained" onPress={onSave} disabled={busy || !selected}>Guardar</Button>
          )}
        </View>
      </Modal>
    </Portal>
  );
}
