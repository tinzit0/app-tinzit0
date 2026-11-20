/**
 * Texto de la app. Siempre usa la tipografía Inter y los colores del tema.
 * Uso: <AppText variant="title">Hola</AppText>
 */
import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { type, type TypeVariant } from '@/theme/tokens';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'warning' | 'onAccent';

type Props = TextProps & {
  variant?: TypeVariant;
  tone?: Tone;
  /** Números con ancho fijo: evita que "salten" cuando cambian (montos, contadores). */
  tabular?: boolean;
};

export function AppText({ variant = 'body', tone = 'primary', tabular, style, ...rest }: Props) {
  const { colors } = useTheme();
  const color = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.accent,
    danger: colors.danger,
    warning: colors.warning,
    onAccent: colors.onAccent,
  }[tone];

  return (
    <Text
      // Permitimos agrandar el texto por accesibilidad, pero con un tope para no romper el diseño.
      maxFontSizeMultiplier={1.4}
      style={[
        type[variant],
        { color },
        variant === 'overline' && { textTransform: 'uppercase' },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
      {...rest}
    />
  );
}
