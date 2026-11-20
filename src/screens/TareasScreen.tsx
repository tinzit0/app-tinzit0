/**
 * Pantalla de Tareas con tres vistas:
 * - Hoy: lo de hoy (incluye atrasadas) + las tareas de "esta semana".
 * - Semana: de lunes a domingo, día por día.
 * - Todas: todas tus tareas, incluidas las que se repiten.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TaskRow } from '@/components/TaskRow';
import {
  alternarTarea,
  tareasDelDia,
  tareasSemanales,
  todasLasTareas,
  type TareaDelDia,
} from '@/database/tareas';
import { space } from '@/theme/tokens';
import { fechaCorta, startOfWeek, toISODate } from '@/utils/fechas';

type Vista = 'hoy' | 'semana' | 'todas';
type Grupo = { key: string; titulo: string; subtitulo?: string; fecha: string; tareas: TareaDelDia[] };

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function TareasScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [vista, setVista] = useState<Vista>('hoy');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const hoyISO = toISODate();
    const nuevos: Grupo[] = [];

    if (vista === 'hoy') {
      nuevos.push({ key: 'hoy', titulo: 'Hoy', fecha: hoyISO, tareas: await tareasDelDia(db, hoyISO) });
      nuevos.push({ key: 'semana', titulo: 'Esta semana', fecha: hoyISO, tareas: await tareasSemanales(db) });
    } else if (vista === 'semana') {
      const lunes = startOfWeek();
      for (let i = 0; i < 7; i++) {
        const d = new Date(lunes);
        d.setDate(lunes.getDate() + i);
        const iso = toISODate(d);
        nuevos.push({
          key: iso,
          titulo: iso === hoyISO ? `${DIAS[i]} · hoy` : DIAS[i],
          subtitulo: fechaCorta(d),
          fecha: iso,
          tareas: await tareasDelDia(db, iso),
        });
      }
      nuevos.push({ key: 'semanales', titulo: 'Sin día fijo', fecha: hoyISO, tareas: await tareasSemanales(db) });
    } else {
      nuevos.push({ key: 'todas', titulo: 'Todas', fecha: hoyISO, tareas: await todasLasTareas(db) });
    }

    setGrupos(nuevos);
    setCargado(true);
  }, [db, vista]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const toggle = async (t: TareaDelDia, hecha: boolean, fecha: string) => {
    // Actualizamos la pantalla al tiro (se siente instantáneo) y después guardamos.
    setGrupos((gs) =>
      gs.map((g) =>
        g.fecha === fecha || vista === 'todas'
          ? { ...g, tareas: g.tareas.map((x) => (x.id === t.id ? { ...x, hecha } : x)) }
          : g,
      ),
    );
    await alternarTarea(db, t, hecha, fecha);
    cargar().catch(console.warn);
  };

  const total = grupos.reduce((n, g) => n + g.tareas.length, 0);
  const pendientesHoy = vista === 'hoy' ? grupos[0]?.tareas.filter((t) => !t.hecha).length ?? 0 : null;

  return (
    <View style={styles.flex}>
      <Screen
        eyebrow={pendientesHoy === null ? 'Organízate' : pendientesHoy === 0 ? 'Todo al día' : `${pendientesHoy} pendientes hoy`}
        title="Tareas"
      >
        <SegmentedControl<Vista>
          value={vista}
          onChange={setVista}
          options={[
            { value: 'hoy', label: 'Hoy' },
            { value: 'semana', label: 'Semana' },
            { value: 'todas', label: 'Todas' },
          ]}
        />

        {cargado && total === 0 ? (
          <View style={{ marginTop: space.xxl }}>
            <EmptyState
              icon="checkmark-done-outline"
              title={vista === 'todas' ? 'Aún no tienes tareas' : 'Nada por aquí'}
              description="Toca el + para agregar una. Puede ser para hoy, para la semana o que se repita."
            />
          </View>
        ) : (
          grupos.map((g) =>
            // En la vista Hoy ocultamos la sección semanal si está vacía.
            g.tareas.length === 0 && vista !== 'semana' ? null : (
              <View key={g.key} style={styles.grupo}>
                <View style={styles.grupoHeader}>
                  <AppText variant="headline">{g.titulo}</AppText>
                  {g.subtitulo ? (
                    <AppText variant="caption" tone="tertiary">{g.subtitulo}</AppText>
                  ) : null}
                </View>
                {g.tareas.length === 0 ? (
                  <AppText variant="caption" tone="tertiary" style={{ marginLeft: space.xs }}>
                    Libre
                  </AppText>
                ) : (
                  g.tareas.map((t) => (
                    <Animated.View
                      key={`${g.key}-${t.id}`}
                      layout={LinearTransition.duration(220)}
                      entering={FadeIn.duration(180)}
                      style={{ marginBottom: space.sm }}
                    >
                      <TaskRow
                        tarea={t}
                        ocultarHoy={vista === 'hoy'}
                        onToggle={(h) => toggle(t, h, g.fecha)}
                        onPress={() => router.push({ pathname: '/tarea', params: { id: String(t.id) } })}
                      />
                    </Animated.View>
                  ))
                )}
              </View>
            ),
          )
        )}
      </Screen>
      <Fab accessibilityLabel="Nueva tarea" onPress={() => router.push('/tarea')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grupo: { marginTop: space.xxl },
  grupoHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.md,
    marginHorizontal: space.xs,
  },
});
