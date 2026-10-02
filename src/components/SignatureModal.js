import React, { useRef, useState } from "react";
import { View, StyleSheet, PanResponder } from "react-native";
import { Text, Button, Portal, Modal } from "react-native-paper";
import { captureRef } from "react-native-view-shot";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const PAD_HEIGHT = 200;
const STROKE = 3;
const MIN_STEP = 3; // px entre puntos: baja la cantidad de segmentos dibujados

const styles = StyleSheet.create({
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text },
  hint: { color: COLORS.muted, fontSize: 12 },
  pad: {
    height: PAD_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  baseline: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 40,
    height: 1,
    backgroundColor: COLORS.border,
  },
  actions: { flexDirection: "row", gap: SPACING.xs, justifyContent: "flex-end" },
});

// Un segmento recto entre dos puntos, dibujado como una View rotada: así la
// firma se hace sin librerías nativas extra (react-native-svg no está en el
// proyecto) y funciona en Expo Go.
function Segment({ a, b }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
  const angle = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (a.x + b.x) / 2 - len / 2,
        top: (a.y + b.y) / 2 - STROKE / 2,
        width: len + STROKE / 2,
        height: STROKE,
        borderRadius: STROKE / 2,
        backgroundColor: "#0F172A",
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

// Firma del cliente en pantalla. Devuelve, al guardar, un archivo PNG
// { uri, name, type } listo para subir como evidencia del cobro.
export default function SignatureModal({ visible, onDismiss, onSave }) {
  const [strokes, setStrokes] = useState([]); // [[{x,y}, ...], ...]
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);
  const current = useRef(null);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // La hoja contiene un ScrollView en algunas pantallas: no ceder el gesto
      // mientras el dedo dibuja.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        current.current = [p];
        setStrokes((s) => [...s, current.current]);
      },
      onPanResponderMove: (e) => {
        const stroke = current.current;
        if (!stroke) return;
        const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        const last = stroke[stroke.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP) return;
        const next = [...stroke, p];
        current.current = next;
        setStrokes((s) => [...s.slice(0, -1), next]);
      },
      onPanResponderRelease: () => {
        current.current = null;
      },
    }),
  ).current;

  const hasInk = strokes.some((s) => s.length > 0);

  const close = () => {
    setStrokes([]);
    onDismiss?.();
  };

  const save = async () => {
    if (!hasInk) return;
    try {
      setSaving(true);
      const uri = await captureRef(padRef, { format: "png", quality: 1 });
      const file = { uri, name: `firma_${Date.now()}.png`, type: "image/png" };
      setStrokes([]);
      await onSave?.(file);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={close} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>Firma del cliente</Text>
        <Text style={styles.hint}>Pedile al cliente que firme con el dedo en el recuadro.</Text>
        <View ref={padRef} collapsable={false} style={styles.pad} {...responder.panHandlers}>
          <View style={styles.baseline} pointerEvents="none" />
          {strokes.map((stroke, i) =>
            stroke.length === 1 ? (
              <Segment key={`d${i}`} a={stroke[0]} b={{ x: stroke[0].x + 0.5, y: stroke[0].y }} />
            ) : (
              stroke.slice(1).map((pt, j) => <Segment key={`s${i}-${j}`} a={stroke[j]} b={pt} />)
            ),
          )}
        </View>
        <View style={styles.actions}>
          <Button onPress={() => setStrokes([])} disabled={!hasInk || saving}>Borrar</Button>
          <Button onPress={close} disabled={saving}>Cancelar</Button>
          <Button mode="contained" onPress={save} disabled={!hasInk || saving} loading={saving}>
            Guardar firma
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}
