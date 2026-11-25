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
import { PressableScale } from '@/components/PressableScale';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import {
  actualizarEvaluacion,
  crearEvaluacion,
  eliminarEvaluacion,
  listarRamosSimple,
  obtenerEvaluacion,
  subnotasDe,
  type Evaluacion,
  type Ramo,
} from '@/database/estudio';
import { formatoHoras, formatoNota, leerNota, notaDeSubnotas, planEstudio } from '@/estudio/logica';
import { reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaCorta, fechaLarga, fromISODate, toISODate } from '@/utils/fechas';

const NOMBRES = ['Prueba 1', 'Prueba 2', 'Control', 'Certamen', 'Examen', 'Tarea', 'Trabajo', 'Disertación'];
const SUBNOMBRES = ['Control 1', 'Control 2', 'Control 3', 'Tarea 1', 'Tarea 2', 'Quiz', 'Laboratorio'];

export function EvaluacionFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; ramo?: string; padre?: string }>();
  const id = params.id ? Number(params.id) : null;
  // Subnota: pertenece a otra evaluación (viene al crearla, o se lee de la base al editarla).
  const [padre, setPadre] = useState<Evaluacion | null>(null);
  const [subnotas, setSubnotas] = useState<Evaluacion[]>([]);

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
    if (params.padre) {
      obtenerEvaluacion(db, Number(params.padre))
        .then((p) => {
          setPadre(p);
          if (p) setRamo(p.course_id);
        })
        .catch(console.warn);
    }
    if (!id) return;
    subnotasDe(db, id).then(setSubnotas).catch(console.warn);
    obtenerEvaluacion(db, id).then((e) => {
      if (!e) return;
      if (e.parent_id) obtenerEvaluacion(db, e.parent_id).then(setPadre).catch(console.warn);
      setRamo(e.course_id);
      setNombre(e.name);
      setPeso(e.weight);
      setNota(e.grade != null ? formatoNota(e.grade) : '');
      setFecha(e.date);
      setHoras(e.study_hours);
    });
  }, [db, id, params.ramo, params.padre]);

  const tieneSubnotas = subnotas.length > 0;
  const calculada = tieneSubnotas ? notaDeSubnotas(subnotas) : null;
  const notaLeida = tieneSubnotas ? (calculada?.nota ?? null) : leerNota(nota);
  const notaInvalida = !tieneSubnotas && nota.trim() !== '' && notaLeida == null;
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
      const datos = { course_id: ramo, name: nombre, weight: peso, grade: notaLeida, date: fecha, study_hours: horas, parent_id: padre?.id ?? null };
      if (id) await actualizarEvaluacion(db, id, datos);
      else await crearEvaluacion(db, datos);
      reprogramarTodo(db).catch(() => {});
      router.back();
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () =>
    Alert.alert(
      tieneSubnotas ? '¿Eliminar evaluación y sus subnotas?' : '¿Eliminar evaluación?',
      tieneSubnotas
        ? `Se borran también sus ${subnotas.length} subnotas y las tareas de estudio pendientes.`
        : 'También se quitan las tareas de estudio pendientes que armé para ella.',
      [
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
      <Stack.Screen options={{ title: padre ? (id ? 'Editar subnota' : 'Nueva subnota') : id ? 'Editar evaluación' : 'Nueva evaluación' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {ramos.length === 0 ? (
          <Card>
            <AppText variant="callout">Primero crea un ramo.</AppText>
            <Button label="Crear ramo" onPress={() => router.replace('/ramo-form')} style={{ marginTop: space.md }} />
          </Card>
        ) : (
          <>
            {padre ? (
              <Card style={{ backgroundColor: colors.accentSoft, borderColor: 'transparent' }}>
                <AppText variant="overline" tone="accent">Subnota de</AppText>
                <AppText variant="headline" style={{ marginTop: space.xs }}>
                  {padre.name}
                  {padre.weight > 0 ? ` · ${Math.round(padre.weight)}% del ramo` : ''}
                </AppText>
                <AppText variant="caption" tone="secondary" style={{ marginTop: space.xs }}>
                  La nota de {padre.name} se calcula sola con el promedio de sus subnotas.
                </AppText>
              </Card>
            ) : (
              <>
                <FieldLabel>Ramo</FieldLabel>
                <View style={styles.wrap}>
                  {ramos.map((r) => (
                    <Chip key={r.id} label={r.name} selected={ramo === r.id} onPress={() => setRamo(r.id)} leading={<View style={[styles.punto, { backgroundColor: r.color }]} />} />
                  ))}
                </View>
              </>
            )}

            <View style={styles.section}>
              <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder={padre ? 'Ej: Control 1' : 'Ej: Prueba 1'} maxLength={40} />
              <View style={[styles.wrap, { marginTop: space.sm }]}>
                {(padre ? SUBNOMBRES : NOMBRES).map((n) => (
                  <Chip key={n} compact label={n} selected={nombre === n} onPress={() => setNombre(n)} />
                ))}
              </View>
            </View>

            <View style={[styles.section, styles.row]}>
              <Stepper label={padre ? `Peso en ${padre.name}` : 'Ponderación'} value={peso} onChange={(v) => setPeso(Math.min(100, v))} step={5} min={0} suffix="%" />
              <View style={{ flex: 1 }}>
                {tieneSubnotas ? (
                  <View>
                    <FieldLabel>Nota (calculada)</FieldLabel>
                    <AppText variant="number" tabular tone={calculada?.nota == null ? 'tertiary' : 'primary'} style={{ marginLeft: space.xs }}>
                      {formatoNota(calculada?.nota ?? calculada?.parcial ?? null)}
                    </AppText>
                  </View>
                ) : (
                  <Field
                    label="Nota (si ya la tienes)"
                    value={nota}
                    onChangeText={setNota}
                    placeholder="1,0 a 7,0"
                    keyboardType="decimal-pad"
                    maxLength={4}
                    accessibilityLabel="Nota"
                  />
                )}
              </View>
            </View>
            {padre ? (
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                Si dejas todas las subnotas en 0%, se saca el promedio simple.
              </AppText>
            ) : null}
            {tieneSubnotas && calculada ? (
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                {calculada.nota != null
                  ? `Promedio de tus ${calculada.total} subnotas.`
                  : calculada.parcial != null
                    ? `Vas en ${formatoNota(calculada.parcial)} con ${calculada.conNota} de ${calculada.total}. Cuenta para el promedio cuando estén todas.`
                    : 'Aparece cuando pongas las notas de las subnotas.'}
              </AppText>
            ) : null}

            {id && !padre ? (
              <View style={styles.section}>
                <FieldLabel>Subnotas</FieldLabel>
                {tieneSubnotas ? (
                  <Card style={{ paddingVertical: space.xs }}>
                    {subnotas.map((s, k) => (
                      <PressableScale
                        key={s.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${s.name}, nota ${formatoNota(s.grade)}. Tocar para editar`}
                        onPress={() => router.push({ pathname: '/evaluacion', params: { id: String(s.id) } })}
                        style={[styles.sub, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                      >
                        <View style={{ flex: 1 }}>
                          <AppText variant="callout" numberOfLines={1}>{s.name}</AppText>
                          {s.weight > 0 ? <AppText variant="caption" tone="tertiary">{Math.round(s.weight)}%</AppText> : null}
                        </View>
                        <AppText variant="headline" tabular tone={s.grade == null ? 'tertiary' : 'primary'}>{formatoNota(s.grade)}</AppText>
                      </PressableScale>
                    ))}
                  </Card>
                ) : (
                  <AppText variant="caption" tone="tertiary">
                    ¿Esta nota sale del promedio de otras? (ej: Controles = promedio de 4 controles). Agrégalas aquí y la calculo sola.
                  </AppText>
                )}
                <Button
                  label="Agregar subnota"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/evaluacion', params: { padre: String(id) } })}
                  style={{ marginTop: space.md }}
                />
              </View>
            ) : null}
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
  sub: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
