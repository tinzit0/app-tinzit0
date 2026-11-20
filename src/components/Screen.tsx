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
      <View style={styles.headerText}>
        {eyebrow ? (
          <AppText variant="overline" tone="tertiary" style={styles.eyebrow}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="display" accessibilityRole="header" numberOfLines={2}>
          {title}
        </AppText>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: space.xxl,
    gap: space.md,
  },
  headerText: { flex: 1 },
  eyebrow: { marginBottom: space.sm },
  right: { paddingBottom: 4 },
});
