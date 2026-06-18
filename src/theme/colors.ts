/** Dark luxury palette. Gold accents on near-black, minimalist. */
export const colors = {
  // Surfaces
  background: "#0B0B0C",
  surface: "#141416",
  surfaceElevated: "#1C1C1F",
  border: "#2A2A2E",

  // Gold accent system
  gold: "#C9A24B",
  goldBright: "#E6C475",
  goldMuted: "#8A6E2F",

  // Text
  textPrimary: "#F5F5F2",
  textSecondary: "#A9A9A6",
  textTertiary: "#6E6E6B",
  textOnGold: "#0B0B0C",

  // Semantic
  success: "#4CAF7D",
  warning: "#E0A040",
  danger: "#D2645A",
  info: "#5A8FD2",

  // Confidence bands
  confidenceHigh: "#4CAF7D",
  confidenceMedium: "#E0A040",
  confidenceLow: "#D2645A",

  // Utility
  overlay: "rgba(0,0,0,0.6)",
  transparent: "transparent",
} as const;

export type ColorToken = keyof typeof colors;
