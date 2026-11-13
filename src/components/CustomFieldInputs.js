import React from "react";
import { View } from "react-native";
import { Text, TextInput, HelperText } from "react-native-paper";
import { DateWheelField } from "./DateWheelPicker";
import CatalogPickerField from "./CatalogPickerField";
import { fieldsInSection } from "../utils/customFields";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const booleanToOption = (value) => {
  if (value === true || value === 1 || value === "1" || value === "true") return "true";
  if (value === false || value === 0 || value === "0" || value === "false") return "false";
  return null;
};

// Campos personalizados de una sección del formulario (los define cada empresa en la web:
// Configuración → Campos personalizados). No pinta nada si la empresa no tiene campos activos en la sección.
export default function CustomFieldInputs({ fields = [], section, values = {}, errors = {}, onChange, title = "Datos adicionales" }) {
  const visible = section ? fieldsInSection(fields, section) : fields;
  if (!visible.length) return null;

  return (
    <View>
      {!!title && <Text style={{ fontWeight: "800", color: COLORS.text, marginBottom: SPACING.xs }}>{title}</Text>}
      {visible.map((field) => {
        const label = Number(field.is_required) === 1 ? `${field.label} *` : field.label;
        const value = values[field.field_key];
        const error = errors[field.field_key];
        const help = error || field.help_text || "";
        let input;
        if (field.field_type === "BOOLEAN" || field.field_type === "LIST") {
          const options =
            field.field_type === "BOOLEAN"
              ? [{ id: "true", label: "Sí" }, { id: "false", label: "No" }]
              : (field.options || []).map((o) => ({ id: o, label: o }));
          input = (
            <CatalogPickerField
              label={label}
              value={field.field_type === "BOOLEAN" ? booleanToOption(value) : value ?? null}
              options={options}
              onChange={(id) => onChange(field.field_key, field.field_type === "BOOLEAN" ? (id == null ? null : id === "true") : id)}
              allowClear
            />
          );
        } else if (field.field_type === "DATE") {
          input = (
            <DateWheelField
              label={label}
              value={value ? String(value).slice(0, 10) : ""}
              onChange={(iso) => onChange(field.field_key, iso || null)}
              error={!!error}
              style={{ backgroundColor: COLORS.card }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
          );
        } else {
          input = (
            <TextInput
              mode="outlined"
              label={label}
              value={value == null ? "" : String(value)}
              onChangeText={(text) => onChange(field.field_key, text)}
              keyboardType={field.field_type === "NUMBER" ? "decimal-pad" : "default"}
              maxLength={field.field_type === "TEXT" ? 1000 : undefined}
              error={!!error}
              style={{ backgroundColor: COLORS.card }}
              outlineStyle={{ borderRadius: RADIUS.md }}
            />
          );
        }
        return (
          <View key={field.id ?? field.field_key} style={{ marginTop: SPACING.sm }}>
            {input}
            {!!help && (
              <HelperText type={error ? "error" : "info"} visible style={{ paddingHorizontal: 0 }}>
                {help}
              </HelperText>
            )}
          </View>
        );
      })}
    </View>
  );
}
