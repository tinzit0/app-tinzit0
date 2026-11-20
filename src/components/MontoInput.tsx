/**
 * Campo de monto en pesos: escribes números y se ve como $12.990.
 */
import { TextInput, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { formatCLP } from '@/utils/moneda';
import { soloDigitos } from '@/utils/montos';

type Props = {
  value: number;
  onChange: (n: number) => void;
  size?: number;
  autoFocus?: boolean;
  placeholder?: string;
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
};

export function MontoInput({ value, onChange, size = 44, autoFocus, placeholder = '$0', accessibilityLabel = 'Monto', style }: Props) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value > 0 ? formatCLP(value) : ''}
      onChangeText={(t) => onChange(Number(soloDigitos(t).slice(0, 10) || 0))}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      keyboardType="number-pad"
      autoFocus={autoFocus}
      selectionColor={colors.accent}
      cursorColor={colors.accent}
      accessibilityLabel={accessibilityLabel}
      maxFontSizeMultiplier={1.2}
      style={[
        {
          fontFamily: fonts.bold,
          fontSize: size,
          letterSpacing: -size * 0.035,
          color: colors.text,
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
          paddingVertical: 4,
        },
        style,
      ]}
    />
  );
}
