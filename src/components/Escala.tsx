/**
 * Escala de números en una fila (0–10 o 0–5) para marcar intensidad o ánimo.
 * Cada número es un botón alto (48 px) para tocarlo fácil con el pulgar.
 */
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  value: number | null;
  onChange: (v: number) => void;
  max?: number;
  etiquetas?: [string, string];
  accessibilityLabel?: string;
};

export function Escala({ value, onChange, max = 10, etiquetas, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const nums = Array.from({ length: max + 1 }, (_, k) => k);
  return (
    <View accessibilityLabel={accessibilityLabel}>
      <View style={styles.fila} accessibilityRole="radiogroup">
        {nums.map((n) => {
          const sel = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`${n} de ${max}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(n);
              }}
              style={[
                styles.celda,
                { backgroundColor: sel ? colors.accent : colors.surfaceRaised, borderColor: sel ? colors.accent : colors.border },
              ]}
            >
              <AppText variant="callout" tabular tone={sel ? 'onAccent' : 'secondary'}>{n}</AppText>
            </Pressable>
          );
        })}
      </View>
      {etiquetas ? (
        <View style={styles.etiquetas}>
          <AppText variant="caption" tone="tertiary">{etiquetas[0]}</AppText>
          <AppText variant="caption" tone="tertiary">{etiquetas[1]}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 4 },
  celda: { flex: 1, height: 48, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  etiquetas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
});
