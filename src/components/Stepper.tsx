/**
 * Selector numérico con botones − y + (para reps y peso en el gym).
 * También se puede escribir el número directamente.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  decimals?: boolean;
  suffix?: string;
  /** Decimales fijos al mostrar, con coma (ej: 1 → "4,0" para notas). */
  fijo?: number;
};

export function Stepper({ label, value, onChange, step = 1, min = 0, decimals, suffix, fijo }: Props) {
  const { colors } = useTheme();
  const [texto, setTexto] = useState<string | null>(null);

  const cambiar = (delta: number) => {
    setTexto(null);
    const nuevo = Math.max(min, Math.round((value + delta) * 100) / 100);
    if (nuevo !== value) Haptics.selectionAsync().catch(() => {});
    onChange(nuevo);
  };

  const boton = (icon: 'remove' | 'add', delta: number, a11y: string) => (
    <PressableScale
      onPress={() => cambiar(delta)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={[styles.btn, { backgroundColor: colors.surfaceRaised }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </PressableScale>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="overline" tone="tertiary" style={{ textAlign: 'center' }}>{label}</AppText>
      <View style={styles.row}>
        {boton('remove', -step, `Bajar ${label}`)}
        <View style={styles.valueWrap}>
          <TextInput
            // Mientras escribes mostramos tu texto tal cual (así "22." no se vuelve "22").
            value={texto ?? (fijo != null ? value.toFixed(fijo).replace('.', ',') : String(value))}
            onFocus={() => setTexto(String(value))}
            onBlur={() => setTexto(null)}
            onChangeText={(t) => {
              const limpio = t.replace(',', '.').replace(decimals ? /[^\d.]/g : /\D/g, '');
              setTexto(limpio);
              const n = Number(limpio);
              if (limpio !== '' && !Number.isNaN(n)) onChange(Math.max(min, n));
            }}
            keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
            selectTextOnFocus
            accessibilityLabel={label}
            maxFontSizeMultiplier={1.2}
            style={[styles.value, { color: colors.text }]}
          />
          {suffix ? <AppText variant="caption" tone="tertiary">{suffix}</AppText> : null}
        </View>
        {boton('add', step, `Subir ${label}`)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: radius.lg, borderWidth: 1, paddingVertical: space.md, paddingHorizontal: space.sm, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  valueWrap: { flex: 1, alignItems: 'center' },
  value: {
    fontFamily: fonts.bold,
    fontSize: 24,
    letterSpacing: -0.6,
    textAlign: 'center',
    minWidth: 40,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
});
