/**
 * Chip: botoncito redondeado para elegir opciones (prioridad, categoría, días…).
 */
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Elemento a la izquierda (un punto de color, un ícono…). */
  leading?: ReactNode;
  compact?: boolean;
  accessibilityLabel?: string;
};

export function Chip({ label, selected, onPress, leading, compact, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={compact ? 6 : 0}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: compact ? 36 : 40,
        minWidth: compact ? 40 : undefined,
        justifyContent: 'center',
        paddingHorizontal: compact ? space.md : space.lg,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: selected ? colors.text : colors.surfaceRaised,
        borderColor: selected ? colors.text : colors.border,
      }}
    >
      {leading}
      <AppText variant="callout" style={{ color: selected ? colors.bg : colors.text }}>
        {label}
      </AppText>
    </PressableScale>
  );
}
