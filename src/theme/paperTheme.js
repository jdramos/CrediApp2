// src/theme/paperTheme.js
import { MD3LightTheme } from "react-native-paper";
import { COLORS } from "./colors";

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 14,
  colors: {
    ...MD3LightTheme.colors,

    primary: COLORS.primary,
    secondary: COLORS.accent,
    error: COLORS.danger,

    background: COLORS.bg,
    surface: COLORS.card,

    onSurface: COLORS.text,
    onBackground: COLORS.text,

    outline: COLORS.border,
  },
};