import { colors } from "./colors";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontFamily: "BodoniModa_700Bold", fontSize: 32, letterSpacing: 0.3 },
  title: { fontFamily: "BodoniModa_700Bold", fontSize: 24, letterSpacing: 0.2 },
  heading: { fontFamily: "Jost_600SemiBold", fontSize: 18 },
  body: { fontFamily: "Jost_400Regular", fontSize: 15, lineHeight: 22 },
  label: { fontFamily: "Jost_600SemiBold", fontSize: 13, letterSpacing: 0.4 },
  caption: { fontFamily: "Jost_400Regular", fontSize: 12 },
} as const;

export const theme = { colors, spacing, radius, typography } as const;
export type Theme = typeof theme;
export { colors };
