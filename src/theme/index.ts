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
  display: { fontSize: 32, fontWeight: "700" as const, letterSpacing: 0.3 },
  title: { fontSize: 24, fontWeight: "700" as const, letterSpacing: 0.2 },
  heading: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: "600" as const, letterSpacing: 0.4 },
  caption: { fontSize: 12, fontWeight: "400" as const },
} as const;

export const theme = { colors, spacing, radius, typography } as const;
export type Theme = typeof theme;
export { colors };
