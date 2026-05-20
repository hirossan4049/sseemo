/**
 * Design tokens — derived from `/tmp/design-bundle/sseemo/project/styles.css`.
 *
 * The Claude Design prototype used CSS variables + `oklch()` for palette.
 * React Native doesn't accept oklch directly, so we resolve the oklch values
 * to their sRGB hex equivalents here. Light/dark are both provided; consumers
 * pick via `useTheme()` (see below).
 *
 * Source mapping (light → dark uses the same key with `[data-theme="dark"]` values):
 *   --accent      = oklch(0.58 0.19 285) → #6A5BE0   (light)
 *   --accent-soft = oklch(0.96 0.03 285) → #EFEBFA   (light)
 *   --accent-text = oklch(0.46 0.20 285) → #4F3FCB   (light)
 *   --warning     = oklch(0.72 0.15 75)  → #D69A3E
 *   --danger      = oklch(0.58 0.18 25)  → #C04A36
 *   --success     = oklch(0.62 0.14 155) → #2E9F6E
 */

export type ThemeName = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  brand1: string;
  brand2: string;
  warning: string;
  warningSoft: string;
  danger: string;
  success: string;
  /** inverse text — used on .btn.primary which paints `var(--text)` bg */
  textInverse: string;
}

const light: Palette = {
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  surface2: '#F4F4F1',
  surface3: '#EBEBE7',
  border: 'rgba(11, 11, 12, 0.07)',
  borderStrong: 'rgba(11, 11, 12, 0.14)',
  text: '#0B0B0C',
  text2: '#5F6068',
  text3: '#9C9DA4',
  accent: '#6A5BE0',
  accentSoft: '#EFEBFA',
  accentText: '#4F3FCB',
  brand1: '#6A6BF0',
  brand2: '#B69FF4',
  warning: '#D69A3E',
  warningSoft: '#FAF1E0',
  danger: '#C04A36',
  success: '#2E9F6E',
  textInverse: '#FAFAF7',
};

const dark: Palette = {
  bg: '#0A0A0B',
  surface: '#131316',
  surface2: '#1A1A1E',
  surface3: '#232328',
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  text: '#F2F2F4',
  text2: '#989AA2',
  text3: '#5B5C63',
  accent: '#9F92F0',
  accentSoft: '#3A2F6E',
  accentText: '#B6ACF5',
  brand1: '#8B8CF8',
  brand2: '#C5B6F7',
  warning: '#E0AB52',
  warningSoft: '#3E3018',
  danger: '#D45D49',
  success: '#3FB07F',
  textInverse: '#0A0A0B',
};

export const palettes: Record<ThemeName, Palette> = { light, dark };

/** Spacing scale (px). Roughly matches the design's 4/8 grid usage. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 14,
  xxl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
} as const;

/** Border radii match the design's 10/12/14/16 ramp. */
export const radii = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  '2xl': 16,
  '3xl': 18,
  pill: 999,
} as const;

/** Type ramp — sizes pulled from the prototype's inline styles. */
export const type = {
  navTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  navSub: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  },
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6 },
  h1Large: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.75 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  h3: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const },
  bodySmall: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '500' as const },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 1.3,
    textTransform: 'uppercase' as const,
  },
  /** Tabular numerals — used for sizes, counts, dates. */
  num: { fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  mono: {
    // RN can't ship JetBrains Mono without expo-font; use system mono.
    fontFamily: 'Menlo' as const,
  },
  brand: {
    // Quicksand from the design — falls back to system in RN.
    fontFamily: 'Avenir Next' as const,
    fontWeight: '700' as const,
    letterSpacing: -0.7,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

// ─── React hook ────────────────────────────────────────────────────────────

import { useColorScheme } from 'react-native';

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? palettes.dark : palettes.light;
}
