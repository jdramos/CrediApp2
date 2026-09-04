// src/theme/colors.js
export const COLORS = {
  // Fintech base
  bg: "#F6F8FC",
  card: "#FFFFFF",

  // Texto
  text: "#0F172A",
  muted: "#475569",
  onGradient: "#FFFFFF",
  onGradientMuted: "rgba(255,255,255,0.78)",

  // UI
  border: "#E2E8F0",

  // Brand
  primary: "#1D4ED8", // azul fintech
  primaryDark: "#1E3A8A",
  accent: "#06B6D4",  // cian

  // Estados
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#EF4444",

  // Soft backgrounds
  infoBg: "#ECFEFF",
  infoBorder: "#CFFAFE",
  primarySoft: "#EEF2FF",
  successSoft: "#ECFDF5",
  warningSoft: "#FFFBEB",
  dangerSoft: "#FEF2F2",
};

// Degradados reutilizables (headers "hero", botones destacados, tarjetas
// de estado) — el mismo par azul->cian de COLORS.primary/accent, para
// que todo el gradiente de la app se sienta coherente.
export const GRADIENTS = {
  primary: ["#1D4ED8", "#0891B2"],
  success: ["#16A34A", "#059669"],
  warning: ["#F59E0B", "#EA580C"],
  danger: ["#EF4444", "#DC2626"],
  dark: ["#0F172A", "#1E293B"],
};