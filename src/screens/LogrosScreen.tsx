/**
 * Todas las medallas: las ganadas a color (con fecha), las pendientes en gris
 * con lo que tienes que hacer para ganarlas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { useLogros } from '@/components/LogrosProvider';
import { desbloqueados, LOGROS } from '@/database/logros';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaCorta, fromISODate } from '@/utils/fechas';

const GRUPOS = ['Tareas', 'Gym', 'Plata', 'Hábitos', 'Otros'] as const;

export function LogrosScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { revisar } = useLogros();
  const [ganados, setGanados] = useState<Map<string, string>>(new Map());

  useFocusEffect(
    useCallback(() => {
      revisar();
      desbloqueados(db).then(setGanados).catch(console.warn);
    }, [db, revisar]),
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Medallas' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <AppText variant="display" tabular>
          {ganados.size}
          <AppText variant="title" tone="tertiary"> / {LOGROS.length}</AppText>
        </AppText>
        <AppText variant="callout" tone="secondary" style={{ marginBottom: space.xl }}>
          {ganados.size === 0 ? 'Tu vitrina está esperando. La primera sale fácil 😉' : 'medallas ganadas'}
        </AppText>

        {GRUPOS.map((g) => (
          <View key={g} style={{ marginBottom: space.xxl }}>
            <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md, marginLeft: space.xs }}>{g}</AppText>
            <View style={styles.grid}>
              {LOGROS.filter((l) => l.grupo === g).map((l) => {
                const fecha = ganados.get(l.key);
                const ok = !!fecha;
                return (
                  <View
                    key={l.key}
                    style={[styles.item, { backgroundColor: colors.surface, borderColor: ok ? `${l.color}66` : colors.border }]}
                    accessibilityLabel={`${l.titulo}: ${l.descripcion}. ${ok ? 'Ganada' : 'Pendiente'}`}
                  >
                    <View style={[styles.medalla, { backgroundColor: ok ? `${l.color}22` : colors.surfaceRaised }]}>
                      <Ionicons
                        name={(ok ? l.icon : 'lock-closed') as keyof typeof Ionicons.glyphMap}
                        size={ok ? 28 : 20}
                        color={ok ? l.color : colors.textTertiary}
                      />
                    </View>
                    <AppText variant="callout" tone={ok ? 'primary' : 'secondary'} style={styles.center} numberOfLines={1}>
                      {l.titulo}
                    </AppText>
                    <AppText variant="caption" tone="tertiary" style={styles.center} numberOfLines={2}>
                      {ok ? `Ganada el ${fechaCorta(fromISODate(fecha.slice(0, 10)))}` : l.descripcion}
                    </AppText>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  item: {
    width: '48.5%',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.lg,
    alignItems: 'center',
    gap: space.xs,
  },
  medalla: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  center: { textAlign: 'center' },
});
