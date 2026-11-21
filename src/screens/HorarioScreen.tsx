/**
 * Horario de la semana, día por día. Hoy va primero y la clase de ahora se destaca.
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import { todosLosBloques, type BloqueConRamo } from '@/database/estudio';
import { claseAhora } from '@/estudio/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { nombreDiaMonFirst, weekdayMonFirst } from '@/utils/fechas';

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function HorarioScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [bloques, setBloques] = useState<BloqueConRamo[]>([]);
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      todosLosBloques(db)
        .then((b) => {
          setBloques(b);
          setCargado(true);
        })
        .catch(console.warn);
    }, [db]),
  );

  const hoy = weekdayMonFirst();
  const { actual } = claseAhora(bloques);
  // Días de la semana empezando por hoy; solo los que tienen clases.
  const dias = Array.from({ length: 7 }, (_, k) => ((hoy - 1 + k) % 7) + 1).filter((d) => bloques.some((b) => b.weekday === d));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Horario' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {cargado && !bloques.length ? (
          <View style={{ gap: space.lg }}>
            <EmptyState icon="calendar-outline" title="Sin horario todavía" description="Abre un ramo, toca el lápiz y agrega sus bloques de clase. Te aviso antes de cada una." />
            <Button label="Ir a mis ramos" onPress={() => router.push('/estudio')} />
          </View>
        ) : (
          dias.map((d) => (
            <View key={d} style={{ marginBottom: space.xxl }}>
              <AppText variant="overline" tone={d === hoy ? 'accent' : 'tertiary'} style={{ marginBottom: space.md }}>
                {d === hoy ? `Hoy · ${nombreDiaMonFirst(d)}` : mayus(nombreDiaMonFirst(d))}
              </AppText>
              <View style={{ gap: space.sm }}>
                {bloques
                  .filter((b) => b.weekday === d)
                  .map((b) => {
                    const ahora = actual?.id === b.id;
                    return (
                      <PressableScale
              accessibilityRole="button"
                        key={b.id}
                        onPress={() => router.push({ pathname: '/ramo', params: { id: String(b.course_id) } })}
                        accessibilityLabel={`${b.name} de ${b.start_time} a ${b.end_time}`}
                        style={[styles.bloque, { backgroundColor: ahora ? colors.accentSoft : colors.surface, borderColor: ahora ? colors.accent : colors.border }]}
                      >
                        <View style={{ width: 56 }}>
                          <AppText variant="callout" tabular>{b.start_time}</AppText>
                          <AppText variant="caption" tone="tertiary" tabular>{b.end_time}</AppText>
                        </View>
                        <View style={[styles.barra, { backgroundColor: b.color }]} />
                        <View style={{ flex: 1 }}>
                          <AppText variant="headline" numberOfLines={1}>{b.name}</AppText>
                          <AppText variant="caption" tone={ahora ? 'accent' : 'tertiary'} numberOfLines={1}>
                            {ahora ? 'Ahora' : ''}{ahora && b.sala ? ' · ' : ''}{b.sala ? `Sala ${b.sala}` : ''}
                          </AppText>
                        </View>
                      </PressableScale>
                    );
                  })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  bloque: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  barra: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
});
