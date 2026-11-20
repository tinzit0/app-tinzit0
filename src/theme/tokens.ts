/**
 * Tokens de diseño de Tinzit0.
 * Aquí viven TODOS los colores, tamaños y espacios de la app.
 * Si quieres cambiar el look, se cambia aquí y se actualiza en todas las pantallas.
 */

// Paleta para modo oscuro: grafito cálido + acento lima.
const dark = {
  bg: '#0B0B0C', // fondo general
  surface: '#141416', // tarjetas
  surfaceRaised: '#1C1C1F', // elementos sobre tarjetas (chips, inputs)
  border: 'rgba(255,255,255,0.07)', // líneas finas
  text: '#F4F4F2', // texto principal
  textSecondary: '#A1A1A6', // texto de apoyo
  textTertiary: '#6B6B70', // texto muy suave (fechas, ayudas)
  accent: '#CFF56B', // color de marca
  accentSoft: 'rgba(207,245,107,0.12)', // fondo suave con el acento
  onAccent: '#0B0B0C', // texto encima del acento
  danger: '#FF6B5E',
  dangerSoft: 'rgba(255,107,94,0.12)',
  warning: '#FFC24B',
  warningSoft: 'rgba(255,194,75,0.12)',
  tabBar: '#0E0E10',
};

// Paleta para modo claro: blanco hueso + acento oliva (el lima no se lee sobre blanco).
const light: typeof dark = {
  bg: '#F6F5F1',
  surface: '#FFFFFF',
  surfaceRaised: '#EFEEE9',
  border: 'rgba(17,17,17,0.08)',
  text: '#111112',
  textSecondary: '#5E5E63',
  textTertiary: '#94949A',
  accent: '#3F6B00',
  accentSoft: 'rgba(63,107,0,0.09)',
  onAccent: '#FFFFFF',
  danger: '#D93A2B',
  dangerSoft: 'rgba(217,58,43,0.09)',
  warning: '#B07600',
  warningSoft: 'rgba(176,118,0,0.10)',
  tabBar: '#FFFFFF',
};

export const palettes = { dark, light };
export type Colors = typeof dark;

/** Espacios en una escala de 4 puntos, para que todo quede alineado. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

/** Bordes redondeados. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** Familias tipográficas (Inter, cargada en el _layout raíz). */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * Estilos de texto. Los títulos grandes llevan letterSpacing negativo:
 * es el detalle que hace que se vean "caros" y no genéricos.
 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40, letterSpacing: -1.1 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  callout: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  number: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
} as const;

export type TypeVariant = keyof typeof type;
