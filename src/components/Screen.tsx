/**
 * Contenedor estándar de cada pantalla:
 * - respeta la zona segura (notch, barra de estado)
 * - título grande arriba, con una "etiqueta" opcional encima
 * - espacio a la derecha para un botón (ej: ⚙️ Ajustes)
 * - contenido con scroll
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  title: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
  /** Quita el scroll (útil para pantallas con listas propias). */
  scroll?: boolean;
};

export function Screen({ title, eyebrow, right, children, scroll = true }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const header = (
    <View style={styles.header}>
      {/* Fila superior: etiqueta a la izquierda, botones a la derecha */}
      {eyebrow || right ? (
        <View style={[styles.topRow, right ? { minHeight: 40 } : null]}>
          <AppText variant="overline" tone="tertiary" style={{ flex: 1 }} numberOfLines={1}>
            {eyebrow ?? ''}
          </AppText>
          {right}
        </View>
      ) : null}
      {/* El título usa todo el ancho */}
      <AppText variant="display" accessibilityRole="header" numberOfLines={3}>
        {title}
      </AppText>
    </View>
  );

  const contentStyle = {
    paddingTop: insets.top + space.lg,
    paddingBottom: space.xxxl * 2,
    paddingHorizontal: space.xl,
  };

  if (!scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bg }, contentStyle]}>
        {header}
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { marginBottom: space.xxl, gap: space.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
