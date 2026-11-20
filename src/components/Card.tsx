/**
 * Tarjeta base: superficie con borde finito y esquinas redondeadas.
 * Si le pasas onPress, se vuelve tocable (con la animación de presión).
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { PressableScale } from './PressableScale';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({ children, onPress, style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
  };

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[base, style]}
      >
        {children}
      </PressableScale>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
