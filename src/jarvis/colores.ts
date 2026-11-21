/**
 * Colores de la interfaz holográfica. Se cambian por voz ("ponte rojo").
 * La interfaz Jarvis siempre es oscura (como un HUD), aunque la app esté en modo claro.
 */
import type { ColorHud } from '@/voice/interpretar';

export const COLOR_HUD: Record<Exclude<ColorHud, 'defecto'>, string> = {
  cian: '#4FD8FF',
  azul: '#4C86FF',
  rojo: '#FF4D5E',
  verde: '#3DFF9A',
  lima: '#CFF56B',
  morado: '#A98BFF',
  naranjo: '#FF9F43',
  dorado: '#FFC94D',
  blanco: '#E6F4FF',
  rosado: '#FF6FB5',
};

export const COLOR_DEFECTO = COLOR_HUD.cian;

export function colorHud(c: string | null | undefined): string {
  if (!c || c === 'defecto') return COLOR_DEFECTO;
  return COLOR_HUD[c as keyof typeof COLOR_HUD] ?? COLOR_DEFECTO;
}

export const HUD = {
  fondo: '#03070B',
  texto: '#E8F6FF',
  tenue: 'rgba(232,246,255,0.55)',
  muyTenue: 'rgba(232,246,255,0.28)',
};
