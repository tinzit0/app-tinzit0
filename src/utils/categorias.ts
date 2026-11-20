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
  color: string;
};

export const CATEGORIAS: Categoria[] = [
  { key: 'comida', label: 'Comida', icon: 'fast-food-outline', color: '#F59E0B' },
  { key: 'transporte', label: 'Transporte', icon: 'bus-outline', color: '#3B82F6' },
  { key: 'ocio', label: 'Ocio', icon: 'game-controller-outline', color: '#A855F7' },
  { key: 'hogar', label: 'Hogar', icon: 'home-outline', color: '#14B8A6' },
  { key: 'salud', label: 'Salud', icon: 'medkit-outline', color: '#EF4444' },
  { key: 'suscripciones', label: 'Suscripciones', icon: 'repeat-outline', color: '#EC4899' },
  { key: 'otros', label: 'Otros', icon: 'ellipsis-horizontal', color: '#8B8B93' },
];

export function categoria(key: string): Categoria {
  return CATEGORIAS.find((c) => c.key === key) ?? CATEGORIAS[CATEGORIAS.length - 1];
}
