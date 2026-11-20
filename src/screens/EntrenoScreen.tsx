/**
 * Registrar el entrenamiento del día:
 * 1. Elige (o escribe) el ejercicio
 * 2. Ajusta reps y peso (se precargan con lo de la última vez)
 * 3. "Agregar serie" — y repites
 * Abajo ves todo lo que llevas hoy, agrupado por ejercicio.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import {
  agregarSerie,
  eliminarSerie,
  listarEjercicios,
  obtenerOCrearEjercicio,
  seriesDeFecha,
  ultimaSerie,
  type EjercicioConStats,
  type SerieConNombre,
} from '@/database/gym';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

export function EntrenoScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const fecha = toISODate();

  const [ejercicios, setEjercicios] = useState<EjercicioConStats[]>([]);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [reps, setReps] = useState(10);
  const [peso, setPeso] = useState(20);
  const [series, setSeries] = useState<SerieConNombre[]>([]);

  const recargar = useCallback(async () => {
    setEjercicios(await listarEjercicios(db));
    setSeries(await seriesDeFecha(db, fecha));
  }, [db, fecha]);

  useEffect(() => {
    recargar().catch(console.warn);
  }, [recargar]);

  // Si ya entrenaste hoy, dejamos elegido el último ejercicio que registraste.
  useEffect(() => {
    seriesDeFecha(db, fecha)
      .then((s) => {
        const ultimo = s[s.length - 1];
        if (ultimo) elegir(ultimo.exercise_id);
      })
      .catch(console.warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al elegir un ejercicio, precargamos lo que hiciste la última vez.
  const elegir = async (id: number) => {
    setSeleccion(id);
    setNuevoNombre('');
    const u = await ultimaSerie(db, id);
    if (u) {
      setReps(u.reps);
      setPeso(u.weight);
    }
  };

  const puedeAgregar = seleccion !== null || nuevoNombre.trim().length > 1;

  const agregar = async () => {
    if (!puedeAgregar) return;
    const id = seleccion ?? (await obtenerOCrearEjercicio(db, nuevoNombre));
    await agregarSerie(db, id, fecha, reps, peso);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSeleccion(id);
    setNuevoNombre('');
    await recargar();
  };

  const borrarSerie = (s: SerieConNombre) => {
    Alert.alert('¿Borrar serie?', `${s.name}: ${s.reps} reps · ${s.weight} kg`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await eliminarSerie(db, s.id);
          await recargar();
        },
      },
    ]);
  };

  // Agrupar las series de hoy por ejercicio
  const grupos: { name: string; sets: SerieConNombre[] }[] = [];
  for (const s of series) {
    const g = grupos.find((x) => x.name === s.name);
    if (g) g.sets.push(s);
    else grupos.push({ name: s.name, sets: [s] });
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Entrenamiento de hoy' }} />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <FieldLabel>Ejercicio</FieldLabel>
        {ejercicios.length > 0 ? (
          <View style={styles.chips}>
            {ejercicios.slice(0, 12).map((e) => (
              <Chip key={e.id} label={e.name} selected={seleccion === e.id} onPress={() => elegir(e.id)} />
            ))}
          </View>
        ) : null}
        <View style={{ marginTop: ejercicios.length > 0 ? space.md : 0 }}>
          <Field
            value={nuevoNombre}
            onChangeText={(t) => {
              setNuevoNombre(t);
              if (t) setSeleccion(null);
            }}
            placeholder={ejercicios.length > 0 ? 'O escribe uno nuevo…' : 'Ej: Press banca'}
            maxLength={40}
            autoCapitalize="sentences"
            returnKeyType="done"
            accessibilityLabel="Nombre del ejercicio"
          />
        </View>

        <View style={styles.steppers}>
          <Stepper label="Reps" value={reps} onChange={setReps} min={1} />
          <Stepper label="Peso" value={peso} onChange={setPeso} step={2.5} decimals suffix="kg" />
        </View>

        <Button label="Agregar serie" onPress={agregar} disabled={!puedeAgregar} style={{ marginTop: space.lg }} />

        {/* Lo que llevas hoy */}
        <AppText variant="headline" style={{ marginTop: space.xxxl, marginBottom: space.md, marginLeft: space.xs }}>
          Hoy
        </AppText>
        {grupos.length === 0 ? (
          <AppText variant="callout" tone="tertiary" style={{ marginLeft: space.xs }}>
            Todavía nada. La primera serie es la más difícil 💪
          </AppText>
        ) : (
          grupos.map((g) => (
            <Animated.View
              key={g.name}
              layout={LinearTransition.duration(200)}
              entering={FadeIn.duration(180)}
              style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <AppText variant="headline" style={{ marginBottom: space.sm }}>{g.name}</AppText>
              {g.sets.map((s, i) => (
                <View key={s.id} style={styles.setRow}>
                  <AppText variant="caption" tone="tertiary" style={{ width: 52 }}>Serie {i + 1}</AppText>
                  <AppText variant="callout" tabular style={{ flex: 1 }}>
                    {s.reps} reps · {s.weight} kg
                  </AppText>
                  <Pressable
                    onPress={() => borrarSerie(s)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Borrar serie ${i + 1} de ${g.name}`}
                  >
                    <Ionicons name="close" size={18} color={colors.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </Animated.View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  steppers: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  group: { borderRadius: radius.md, borderWidth: 1, padding: space.lg, marginBottom: space.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: space.sm },
});
