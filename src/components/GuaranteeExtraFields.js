import React from "react";
import { View } from "react-native";
import { TextInput } from "react-native-paper";
import CatalogPickerField from "./CatalogPickerField";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

// Datos opcionales de una garantía que también pide la web (los usa el formulario de retiro de garantías):
// modelo, color, años de uso, estado y ubicación. El servidor los guarda en columnas aparte de artículo/marca/serie/valor.
export const CONDITION_OPTIONS = [
  { id: "B", label: "Bueno" },
  { id: "R", label: "Regular" },
  { id: "M", label: "Malo" },
];
export const LOCATION_OPTIONS = [
  { id: "CASA", label: "Casa" },
  { id: "NEGOCIO", label: "Negocio" },
];

// Solo manda las claves con valor: así una garantía nueva no pisa nada y las existentes no se tocan.
export function guaranteeExtraPayload(extra = {}) {
  const out = {};
  for (const key of ["model", "color", "years_of_use", "condition_code", "location"]) {
    const v = extra[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") out[key] = String(v).trim();
  }
  return out;
}

export default function GuaranteeExtraFields({ value = {}, onChange, disabled }) {
  const set = (key, v) => onChange({ ...value, [key]: v });
  const input = (key, label, maxLength) => (
    <TextInput
      mode="outlined"
      label={label}
      value={value[key] ?? ""}
      onChangeText={(t) => set(key, t)}
      maxLength={maxLength}
      disabled={disabled}
      style={{ backgroundColor: COLORS.card, marginTop: SPACING.sm }}
      outlineStyle={{ borderRadius: RADIUS.md }}
    />
  );
  return (
    <View>
      {input("model", "Modelo (opcional)", 80)}
      {input("color", "Color (opcional)", 40)}
      {input("years_of_use", "Años de uso (opcional)", 30)}
      <CatalogPickerField
        label="Estado (opcional)"
        value={value.condition_code ?? null}
        options={CONDITION_OPTIONS}
        onChange={(id) => set("condition_code", id ?? "")}
        disabled={disabled}
        allowClear
      />
      <CatalogPickerField
        label="Ubicación (opcional)"
        value={value.location ?? null}
        options={LOCATION_OPTIONS}
        onChange={(id) => set("location", id ?? "")}
        disabled={disabled}
        allowClear
      />
    </View>
  );
}
