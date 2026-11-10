import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Portal, Modal, Text, Button, TextInput, HelperText } from "react-native-paper";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

// Selector de fecha de "ruedas" (día · mes · año) que giran sin fin: se desliza el dedo hacia arriba
// o abajo y la fecha queda en el renglón del centro. Día y mes dan la vuelta (después de diciembre
// viene enero); el año va de minYear a maxYear. Reemplaza el calendario del sistema y los campos de
// texto AAAA-MM-DD. Las fechas entran y salen como texto "AAAA-MM-DD" (sin zona horaria, así que no
// se corre un día como pasaba con toISOString()).

const ITEM_H = 44;
const ROWS = 5; // renglones visibles; el del centro es el elegido
const CYCLES = 60; // vueltas repetidas de la rueda para que parezca infinita
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const pad = (n) => String(n).padStart(2, "0");
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
  return { y, m: mo, d };
}

export const todayISODate = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

// "2026-11-09" -> "09/11/2026"
export const formatDMY = (iso) => {
  const p = parseISODate(iso);
  return p ? `${pad(p.d)}/${pad(p.m)}/${p.y}` : "";
};

const styles = StyleSheet.create({
  modal: { backgroundColor: COLORS.card, margin: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.md },
  title: { fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs },
  preview: { color: COLORS.primary, fontWeight: "800", fontSize: 16, marginBottom: SPACING.sm },
  headers: { flexDirection: "row", marginBottom: 2 },
  header: { textAlign: "center", color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  wheels: { flexDirection: "row", height: ITEM_H * ROWS },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    top: ITEM_H * Math.floor(ROWS / 2),
    height: ITEM_H,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: "rgba(37, 99, 235, 0.06)",
  },
  item: { height: ITEM_H, alignItems: "center", justifyContent: "center" },
  itemText: { fontSize: 18, color: COLORS.text },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.sm, marginTop: SPACING.md, flexWrap: "wrap" },
});

// Una rueda. `index` es la posición elegida dentro de `items` (0..n-1).
function Wheel({ items, index, onIndexChange, loop }) {
  const n = items.length;
  const ref = useRef(null);
  const start = loop ? Math.floor(CYCLES / 2) * n + index : index;
  const current = useRef(start);

  const data = useMemo(() => {
    const total = loop ? n * CYCLES : n;
    return Array.from({ length: total }, (_, i) => ({ key: String(i), label: items[i % n] }));
  }, [items, n, loop]);

  const scrollTo = useCallback((idx, animated) => {
    ref.current?.scrollToOffset({ offset: idx * ITEM_H, animated });
  }, []);

  // Posición inicial y cambios que vienen de afuera (p. ej. el día se ajusta al cambiar de mes).
  useEffect(() => {
    const base = loop ? Math.floor(current.current / n) * n : 0;
    const target = base + index;
    const t = setTimeout(() => {
      current.current = target;
      scrollTo(target, false);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, n]);

  const settle = useCallback(
    (offsetY) => {
      const idx = Math.max(0, Math.min(data.length - 1, Math.round(offsetY / ITEM_H)));
      current.current = idx;
      const value = loop ? idx % n : idx;
      if (value !== index) onIndexChange(value);
      // Cerca de un extremo: se vuelve al centro sin que se note.
      if (loop && (idx < n * 2 || idx > n * (CYCLES - 2))) {
        const target = Math.floor(CYCLES / 2) * n + value;
        current.current = target;
        scrollTo(target, false);
      }
    },
    [data.length, index, loop, n, onIndexChange, scrollTo],
  );

  return (
    <FlatList
      ref={ref}
      data={data}
      keyExtractor={(item) => item.key}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      nestedScrollEnabled
      initialNumToRender={ROWS * 3}
      windowSize={9}
      getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * (i + 2), index: i })}
      ListHeaderComponent={<View style={{ height: ITEM_H * 2 }} />}
      ListFooterComponent={<View style={{ height: ITEM_H * 2 }} />}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => {
        // iOS: si se suelta sin impulso no hay "momentum" y se asienta aquí. En Android no viene
        // velocity y el asiento siempre llega por onMomentumScrollEnd.
        const v = e.nativeEvent.velocity;
        if (v && Math.abs(v.y) < 0.05) settle(e.nativeEvent.contentOffset.y);
      }}
      renderItem={({ item, index: i }) => (
        <Pressable
          style={styles.item}
          onPress={() => {
            current.current = i;
            scrollTo(i, true);
            const value = loop ? i % n : i;
            if (value !== index) onIndexChange(value);
          }}
        >
          <Text style={styles.itemText}>{item.label}</Text>
        </Pressable>
      )}
    />
  );
}

// Ventana con las tres ruedas. `value` y lo que entrega onConfirm son "AAAA-MM-DD" (o null al borrar).
export default function DateWheelPicker({
  visible,
  value,
  title = "Fecha",
  minYear = 1920,
  maxYear = new Date().getFullYear() + 20,
  defaultValue,
  clearable = false,
  onConfirm,
  onCancel,
}) {
  const [y, setY] = useState(0);
  const [m, setM] = useState(1);
  const [d, setD] = useState(1);
  const [ready, setReady] = useState(false);

  // Al abrirse se carga la fecha actual del campo (o la sugerida, o hoy).
  useEffect(() => {
    if (!visible) {
      setReady(false);
      return;
    }
    const p = parseISODate(value) || parseISODate(defaultValue) || parseISODate(todayISODate());
    setY(Math.max(minYear, Math.min(maxYear, p.y)));
    setM(p.m);
    setD(p.d);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const years = useMemo(() => Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => String(minYear + i)), [minYear, maxYear]);
  const dayCount = y ? daysIn(y, m) : 31;
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => String(i + 1)), [dayCount]);
  const day = Math.min(d, dayCount);

  const iso = y ? `${y}-${pad(m)}-${pad(day)}` : "";

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onCancel} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>{title}</Text>
        <Text style={styles.preview}>{formatDMY(iso) || "—"}</Text>

        <View style={styles.headers}>
          <Text style={[styles.header, { flex: 1 }]}>Día</Text>
          <Text style={[styles.header, { flex: 2 }]}>Mes</Text>
          <Text style={[styles.header, { flex: 1.3 }]}>Año</Text>
        </View>
        <View>
          <View style={styles.wheels}>
            {ready && (<>
            <View style={{ flex: 1 }}>
              {/* key: al cambiar la cantidad de días del mes la rueda se arma de nuevo */}
              <Wheel key={`d${dayCount}`} items={days} index={day - 1} loop onIndexChange={(i) => setD(i + 1)} />
            </View>
            <View style={{ flex: 2 }}>
              <Wheel items={MONTHS} index={m - 1} loop onIndexChange={(i) => setM(i + 1)} />
            </View>
            <View style={{ flex: 1.3 }}>
              <Wheel items={years} index={Math.max(0, Math.min(years.length - 1, (y || minYear) - minYear))} onIndexChange={(i) => setY(minYear + i)} />
            </View>
            </>)}
          </View>
          <View style={styles.band} pointerEvents="none" />
        </View>

        <View style={styles.actions}>
          {clearable && (
            <Button textColor={COLORS.danger} onPress={() => onConfirm(null)}>Borrar</Button>
          )}
          <Button onPress={onCancel}>Cancelar</Button>
          <Button mode="contained" onPress={() => onConfirm(iso)} disabled={!iso}>Aceptar</Button>
        </View>
      </Modal>
    </Portal>
  );
}

// Campo de formulario que abre el selector (sustituye al TextInput AAAA-MM-DD).
export function DateWheelField({
  label,
  value,
  onChange,
  error,
  helperText,
  minYear,
  maxYear,
  defaultValue,
  clearable = true,
  disabled,
  style,
  outlineStyle,
  dense,
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => !disabled && setOpen(true)} disabled={disabled}>
        <View pointerEvents="none">
          <TextInput
            mode="outlined"
            dense={dense}
            label={label}
            value={formatDMY(value)}
            placeholder="dd/mm/aaaa"
            editable={false}
            error={!!error}
            style={style}
            outlineStyle={outlineStyle}
            left={<TextInput.Icon icon="calendar" />}
            right={<TextInput.Icon icon="chevron-down" />}
          />
        </View>
      </Pressable>
      {!!(error || helperText) && (
        <HelperText type={error ? "error" : "info"} visible>{error || helperText}</HelperText>
      )}
      <DateWheelPicker
        visible={open}
        value={value}
        title={label}
        minYear={minYear}
        maxYear={maxYear}
        defaultValue={defaultValue}
        clearable={clearable && !!value}
        onCancel={() => setOpen(false)}
        onConfirm={(iso) => {
          setOpen(false);
          onChange(iso);
        }}
      />
    </View>
  );
}
