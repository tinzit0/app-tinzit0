/**
 * Agregar o editar un ramo de la malla: nombre, semestre, créditos y prerrequisitos
 * (se eligen entre los ramos de semestres anteriores).
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import { eliminarRamoMalla, guardarRamoMalla, listarMalla, obtenerRamoMalla } from '@/database/malla';
import type { RamoMalla } from '@/malla/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function MallaRamoFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [todos, setTodos] = useState<RamoMalla[]>([]);
  const [nombre, setNombre] = useState('');
  const [semestre, setSemestre] = useState(1);
  const [creditos, setCreditos] = useState(5);
  const [prereqs, setPrereqs] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const lista = await listarMalla(db);
      setTodos(lista);
      if (id) {
        const r = await obtenerRamoMalla(db, id);
        if (!r) return;
        setNombre(r.name);
        setSemestre(r.semester);
        setCreditos(r.credits);
        setPrereqs(r.prereqs);
      } else if (lista.length) {
        // Un ramo nuevo parte en el último semestre que tienes.
        setSemestre(Math.max(...lista.map((x) => x.semester)));
      }
    })().catch(console.warn);
  }, [db, id]);

  const candidatos = todos.filter((r) => r.id !== id && r.semester < semestre);

  const guardar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      // Solo quedan los prerrequisitos que siguen siendo de semestres anteriores.
      const validos = prereqs.filter((p) => candidatos.some((c) => c.id === p));
      await guardarRamoMalla(db, id, { name: nombre, semester: semestre, credits: creditos, prereqs: validos });
      router.back();
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () =>
    Alert.alert('¿Quitar este ramo de la malla?', 'También deja de ser prerrequisito de otros ramos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          if (id) await eliminarRamoMalla(db, id);
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar ramo' : 'Nuevo ramo de la malla' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field big value={nombre} onChangeText={setNombre} placeholder="Nombre del ramo" autoFocus={!id} maxLength={80} accessibilityLabel="Nombre del ramo" />

        <View style={[styles.section, styles.row]}>
          <Stepper label="Semestre" value={semestre} onChange={(v) => setSemestre(Math.min(20, Math.max(1, v)))} min={1} />
          <Stepper label="Créditos" value={creditos} onChange={(v) => setCreditos(Math.min(60, v))} min={0} />
        </View>

        <View style={styles.section}>
          <FieldLabel>Prerrequisitos</FieldLabel>
          {candidatos.length ? (
            <View style={styles.wrap}>
              {candidatos.map((c) => (
                <Chip
                  key={c.id}
                  compact
                  label={c.name}
                  selected={prereqs.includes(c.id)}
                  onPress={() => setPrereqs((ps) => (ps.includes(c.id) ? ps.filter((x) => x !== c.id) : [...ps, c.id]))}
                />
              ))}
            </View>
          ) : (
            <AppText variant="caption" tone="tertiary">
              {semestre === 1 ? 'Los ramos del primer semestre no tienen prerrequisitos.' : 'Aún no hay ramos en semestres anteriores.'}
            </AppText>
          )}
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Agregar a la malla'} onPress={guardar} disabled={!nombre.trim()} loading={guardando} />
          {id ? <Button label="Quitar de la malla" variant="danger" onPress={borrar} /> : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  row: { flexDirection: 'row', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
