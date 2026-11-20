/**
 * Barra de progreso (ej: cuánto llevas del presupuesto semanal).
 * Cambia de color: normal → amarillo sobre 80% → rojo al pasarse.
 */
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type Props = { value: number; max: number };

export function ProgressBar({ value, max }: Props) {
  const { colors } = useTheme();
  const ratio = max > 0 ? value / max : 0;
  const width = `${Math.min(ratio, 1) * 100}%` as const;
  const fill = ratio >= 1 ? colors.danger : ratio >= 0.8 ? colors.warning : colors.accent;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }}
    >
      <View style={{ width, height: '100%', borderRadius: 3, backgroundColor: fill }} />
    </View>
  );
}
