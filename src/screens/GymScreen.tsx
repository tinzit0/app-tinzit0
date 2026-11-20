/**
 * Pantalla principal del Gym:
 * - Qué toca hoy + botón para registrar el entrenamiento
 * - La semana (L a D) con lo que toca cada día y los días ya entrenados
 * - Tus ejercicios con su mejor marca (toca uno para ver progreso)
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { rangoSemana } from '@/database/gastos';
import {
  fechasEntrenadas,
  listarEjercicios,
  obtenerRutina,
  seriesDeFecha,
  type DiaRutina,
  type EjercicioConStats,
} from '@/database/gym';
import { ultimosValores } from '@/database/cuerpo';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaCorta, fromISODate, startOfWeek, toISODate, weekdayMonFirst } from '@/utils/fechas';

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function GymScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [rutina, setRutina] = useState<DiaRutina[]>([]);
  const [entrenadas, setEntrenadas] = useState<string[]>([]);
  const [ejercicios, setEjercicios] = useState<EjercicioConStats[]>([]);
  const [seriesHoy, setSeriesHoy] = useState(0);
  const [peso, setPeso] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setRutina(await obtenerRutina(db));
        setEntrenadas(await fechasEntrenadas(db, rangoSemana()));
        setEjercicios(await listarEjercicios(db));
        setSeriesHoy((await seriesDeFecha(db, toISODate())).length);
        setPeso((await ultimosValores(db)).weight?.valor ?? null);
      })().catch(console.warn);
    }, [db]),
  );

  const hoyN = weekdayMonFirst();
  const hoyLabel = rutina.find((r) => r.weekday === hoyN)?.label ?? null;
  const lunes = startOfWeek();
  const entrenadosSemana = entrenadas.length;
  const planificados = rutina.length;

  return (
    <Screen
      eyebrow={planificados > 0 ? `${entrenadosSemana} de ${planificados} días esta semana` : 'Entrenamiento'}
      title="Gym"
    >
      {/* Hoy */}
      <Card>
        <AppText variant="overline" tone="tertiary">Hoy toca</AppText>
        <AppText variant="display" style={{ marginTop: space.sm }}>
          {hoyLabel ?? 'Descanso'}
        </AppText>
        <AppText variant="callout" tone="secondary" style={{ marginTop: space.xs }}>
          {seriesHoy > 0
            ? `Llevas ${seriesHoy} ${seriesHoy === 1 ? 'serie' : 'series'} hoy. Sigue así 🔥`
            : hoyLabel
              ? 'Cuando llegues al gym, registra tus series aquí.'
              : 'Día libre. Si igual vas, anótalo.'}
        </AppText>
        <Button
          label={seriesHoy > 0 ? 'Seguir registrando' : 'Registrar entrenamiento'}
          onPress={() => router.push('/entreno')}
          style={{ marginTop: space.xl }}
        />
      </Card>

      {/* Cuerpo: peso y medidas */}
      <Card
        onPress={() => router.push('/cuerpo')}
        accessibilityLabel="Peso y medidas"
        style={[styles.cuerpo, { marginTop: space.md }]}
      >
        <Ionicons name="body-outline" size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <AppText variant="callout">Peso y medidas</AppText>
          <AppText variant="caption" tone="tertiary">
            {peso ? `Último peso: ${peso} kg` : 'Registra tu peso para ver tu evolución'}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Card>

      {/* Semana */}
      <View style={styles.sectionHeader}>
        <AppText variant="headline">Tu semana</AppText>
        <Pressable onPress={() => router.push('/rutina')} hitSlop={10} accessibilityRole="button">
          <AppText variant="callout" tone="accent">Editar rutina</AppText>
        </Pressable>
      </View>
      <View style={styles.week}>
        {DIAS.map((d, i) => {
          const n = i + 1;
          const fecha = new Date(lunes);
          fecha.setDate(lunes.getDate() + i);
          const iso = toISODate(fecha);
          const label = rutina.find((r) => r.weekday === n)?.label;
          const hecho = entrenadas.includes(iso);
          const esHoy = n === hoyN;
          return (
            <View
              key={n}
              accessibilityLabel={`${fechaCorta(fecha)}: ${label ?? 'descanso'}${hecho ? ', entrenado' : ''}`}
              style={[
                styles.day,
                {
                  backgroundColor: hecho ? colors.accent : colors.surface,
                  borderColor: esHoy ? colors.text : colors.border,
                  borderWidth: esHoy ? 1.5 : 1,
                },
              ]}
            >
              <AppText variant="overline" style={{ color: hecho ? colors.onAccent : colors.textTertiary }}>
                {d}
              </AppText>
              {hecho ? (
                <Ionicons name="checkmark" size={16} color={colors.onAccent} />
              ) : (
                <View style={[styles.dot, { backgroundColor: label ? colors.text : 'transparent', borderColor: colors.textTertiary }]} />
              )}
            </View>
          );
        })}
      </View>
      {rutina.length === 0 ? (
        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm, marginLeft: space.xs }}>
          Aún no armas tu rutina. Toca “Editar rutina”.
        </AppText>
      ) : null}

      {/* Ejercicios */}
      <View style={styles.sectionHeader}>
        <AppText variant="headline">Ejercicios</AppText>
      </View>
      {ejercicios.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title="Sin ejercicios aún"
          description="Se agregan solos cuando registras tu primer entrenamiento."
        />
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {ejercicios.map((e, i) => (
            <PressableScale
              key={e.id}
              pressedScale={0.99}
              onPress={() => router.push({ pathname: '/ejercicio', params: { id: String(e.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`Ver progreso de ${e.name}`}
              style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="callout" numberOfLines={1}>{e.name}</AppText>
                <AppText variant="caption" tone="tertiary">
                  {e.ultima ? `Última vez: ${fechaCorta(fromISODate(e.ultima))} · ${e.sesiones} ${e.sesiones === 1 ? 'sesión' : 'sesiones'}` : 'Sin registros'}
                </AppText>
              </View>
              {e.maxPeso ? (
                <AppText variant="headline" tabular>{e.maxPeso} kg</AppText>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </PressableScale>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: space.xxl,
    marginBottom: space.md,
    marginHorizontal: space.xs,
  },
  week: { flexDirection: 'row', gap: 6 },
  cuerpo: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  day: {
    flex: 1,
    aspectRatio: 0.72,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  dot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 64 },
});
