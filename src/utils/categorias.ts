/**
 * Categorías de gastos. Cada una tiene un ícono y un color propio
 * (los colores funcionan bien tanto en modo claro como oscuro).
 */
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type Categoria = {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Color en modo oscuro y en modo claro (cada uno validado contra su fondo). */
  color: string;
  colorLight: string;
};

// El ORDEN importa: sigue la paleta categórica validada para daltonismo
// (azul, naranjo, aqua, amarillo, magenta, verde). "Otros" va en gris neutro.
// Los gráficos dibujan siempre en este orden, así dos colores parecidos nunca quedan juntos.
export const CATEGORIAS: Categoria[] = [
  { key: 'transporte', label: 'Transporte', icon: 'bus-outline', color: '#3987e5', colorLight: '#2a78d6' },
  { key: 'comida', label: 'Comida', icon: 'fast-food-outline', color: '#d95926', colorLight: '#eb6834' },
  { key: 'hogar', label: 'Hogar', icon: 'home-outline', color: '#199e70', colorLight: '#1baf7a' },
  { key: 'ocio', label: 'Ocio', icon: 'game-controller-outline', color: '#c98500', colorLight: '#eda100' },
  { key: 'salud', label: 'Salud', icon: 'medkit-outline', color: '#d55181', colorLight: '#e87ba4' },
  { key: 'suscripciones', label: 'Suscripciones', icon: 'repeat-outline', color: '#0ca30c', colorLight: '#008300' },
  { key: 'otros', label: 'Otros', icon: 'ellipsis-horizontal', color: '#8B8B93', colorLight: '#8B8B93' },
];

/** Color de la categoría según el tema. */
export function colorCategoria(c: Categoria, isDark: boolean): string {
  return isDark ? c.color : c.colorLight;
}

export function categoria(key: string): Categoria {
  return CATEGORIAS.find((c) => c.key === key) ?? CATEGORIAS[CATEGORIAS.length - 1];
}
