/**
 * Campo de formulario: etiqueta + caja de texto, con el estilo de la app.
 * También exporta FieldLabel para usar la etiqueta sola (sobre chips, etc.).
 */
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { AppText } from './AppText';

export function FieldLabel({ children }: { children: string }) {
  return (
    <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.sm, marginLeft: space.xs }}>
      {children}
    </AppText>
  );
}

type Props = TextInputProps & { label?: string; big?: boolean };

export function Field({ label, big, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <View>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        style={[
          big ? type.title : type.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            minHeight: big ? 60 : 50,
          },
          rest.multiline && { minHeight: 96, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
