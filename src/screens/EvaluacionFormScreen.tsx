/**
 * Crear o editar una evaluación: ramo, nombre, ponderación, nota (si ya la tienes),
 * fecha y horas de estudio. Con fecha + horas se arma solo un plan de estudio en Tareas.
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import {
  actualizarEvaluacion,
  crearEvaluacion,
  eliminarEvaluacion,
  listarRamosSimple,
  obtenerEvaluacion,
  type Ramo,
} from '@/database/estudio';
import { formatoHoras, formatoNota, leerNota, planEstudio } from '@/estudio/logica';
import { reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaCorta, fechaLarga, fromISODate, toISODate } from '@/utils/fechas';

const NOMBRES = ['Prueba 1', 'Prueba 2', 'Control', 'Certamen', 'Examen', 'Tarea', 'Trabajo', 'Disertación'];

export function EvaluacionFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; ramo?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [ramo, setRamo] = useState<number | null>(params.ramo ? Number(params.ramo) : null);
  const [nombre, setNombre] = useState('');
  const [peso, setPeso] = useState(0);
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState<string | null>(null);
  const [horas, setHoras] = useState(0);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    listarRamosSimple(db)
      .then((r) => {
        setRamos(r);
        if (!params.ramo && !id && r.length === 1) setRamo(r[0].id);
      })
      .catch(console.warn);
    if (!id) return;
    obtenerEvaluacion(db, id).then((e) => {
      if (!e) return;
      setRamo(e.course_id);
      setNombre(e.name);
      setPeso(e.weight);
      setNota(e.grade != null ? formatoNota(e.grade) : '');
      setFecha(e.date);
      setHoras(e.study_hours);
    });
  }, [db, id, params.ramo]);

  const notaLeida = leerNota(nota);
  const notaInvalida = nota.trim() !== '' && notaLeida == null;
  const plan = fecha && horas > 0 && notaLeida == null ? planEstudio(horas, fecha) : [];
  const valido = !!ramo && nombre.trim().length > 0 && !notaInvalida;

  const elegirFecha = () => {
    if (Platform.OS !== 'android') {
      setFecha(toISODate(new Date(Date.now() + 7 * 86400000)));
      return;
    }
    DateTimePickerAndroid.open({
      value: fecha ? fromISODate(fecha) : new Date(),
      mode: 'date',
      onChange: (e, d) => e.type === 'set' && d && setFecha(toISODate(d)),
    });
  };

  const guardar = async () => {
    if (!valido || !ramo) return;
    setGuardando(true);
    try {
      const datos = { course_id: ramo, name: nombre, weight: peso, grade: notaLeida, date: fecha, study_hours: horas };
      if (id) await actualizarEvaluacion(db, id, datos);
      else await crearEvaluacion(db, datos);
      reprogramarTodo(db).catch(() => {});
      router.back();
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () =>
    Alert.alert('¿Eliminar evaluación?', 'También se quitan las tareas de estudio pendientes que armé para ella.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (id) await eliminarEvaluacion(db, id);
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar evaluación' : 'Nueva evaluación' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {ramos.length === 0 ? (
          <Card>
            <AppText variant="callout">Primero crea un ramo.</AppText>
            <Button label="Crear ramo" onPress={() => router.replace('/ramo-form')} style={{ marginTop: space.md }} />
          </Card>
        ) : (
          <>
            <FieldLabel>Ramo</FieldLabel>
            <View style={styles.wrap}>
              {ramos.map((r) => (
                <Chip key={r.id} label={r.name} selected={ramo === r.id} onPress={() => setRamo(r.id)} leading={<View style={[styles.punto, { backgroundColor: r.color }]} />} />
              ))}
            </View>

            <View style={styles.section}>
              <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Ej: Prueba 1" maxLength={40} />
              <View style={[styles.wrap, { marginTop: space.sm }]}>
                {NOMBRES.map((n) => (
                  <Chip key={n} compact label={n} selected={nombre === n} onPress={() => setNombre(n)} />
                ))}
              </View>
            </View>

            <View style={[styles.section, styles.row]}>
              <Stepper label="Ponderación" value={peso} onChange={(v) => setPeso(Math.min(100, v))} step={5} min={0} suffix="%" />
              <View style={{ flex: 1 }}>
                <Field
                  label="Nota (si ya la tienes)"
                  value={nota}
                  onChangeText={setNota}
                  placeholder="1,0 a 7,0"
                  keyboardType="decimal-pad"
                  maxLength={4}
                  accessibilityLabel="Nota"
                />
              </View>
            </View>
            {notaInvalida ? (
              <AppText variant="caption" tone="danger" style={{ marginTop: space.sm }}>La nota va de 1,0 a 7,0.</AppText>
            ) : null}

            <View style={styles.section}>
              <FieldLabel>Fecha</FieldLabel>
              <View style={styles.wrap}>
                <Chip label={fecha ? fechaLarga(fromISODate(fecha)) : 'Elegir fecha'} selected={!!fecha} onPress={elegirFecha} />
                {fecha ? <Chip label="Sin fecha" onPress={() => setFecha(null)} /> : null}
              </View>
            </View>

            {notaLeida == null ? (
              <View style={styles.section}>
                <Stepper label="Horas de estudio" value={horas} onChange={(v) => setHoras(Math.min(40, Math.round(v * 2) / 2))} step={0.5} min={0} decimals suffix=" h" />
                {plan.length ? (
                  <Card style={{ marginTop: space.md }}>
                    <AppText variant="overline" tone="accent">Plan de estudio</AppText>
                    <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>
                      {plan.map((b) => `${fechaCorta(fromISODate(b.fecha))}: ${formatoHoras(b.horas)}`).join(' · ')}
                    </AppText>
                    <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                      Se agregan solas a tus Tareas. Si cambias la fecha o las horas, rehago el plan.
                    </AppText>
                  </Card>
                ) : fecha ? (
                  <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                    Pon cuántas horas quieres estudiar y te reparto el estudio hasta el día antes.
                  </AppText>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.section, { gap: space.md }]}>
              <Button label={id ? 'Guardar cambios' : 'Guardar evaluación'} onPress={guardar} disabled={!valido} loading={guardando} />
              {id ? <Button label="Eliminar evaluación" variant="danger" onPress={borrar} /> : null}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  punto: { width: 10, height: 10, borderRadius: 5 },
});
