/**
 * Formulario para crear o editar una tarea.
 * Se abre como /tarea (nueva) o /tarea?id=5 (editar la 5).
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import {
  actualizarTarea,
  AVISOS_TAREA,
  crearTarea,
  eliminarTarea,
  obtenerTarea,
  type Prioridad,
  type Repeticion,
} from '@/database/tareas';
import { prepararNotificaciones, reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { endOfWeek, fechaLarga, fromISODate, toISODate } from '@/utils/fechas';

type Cuando = 'hoy' | 'manana' | 'semana' | 'fecha' | 'sin';
const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function TareaFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // Vuelve atrás; si no hay pantalla anterior (ej: se abrió por enlace), va al inicio.
  const cerrar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; titulo?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [titulo, setTitulo] = useState(params.titulo ?? '');
  const [notas, setNotas] = useState('');
  const [prioridad, setPrioridad] = useState<Prioridad>('media');
  const [repeticion, setRepeticion] = useState<Repeticion>('none');
  const [dias, setDias] = useState<number[]>([]);
  const [cuando, setCuando] = useState<Cuando>('hoy');
  const [fecha, setFecha] = useState<Date>(new Date());
  const [mostrarPickerIOS, setMostrarPickerIOS] = useState(false);
  const [hora, setHora] = useState<string | null>(null);
  const [aviso, setAviso] = useState<number | null>(null);
  const [pickerHoraIOS, setPickerHoraIOS] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Si estamos editando, cargamos los datos de la tarea.
  useEffect(() => {
    if (!id) return;
    obtenerTarea(db, id).then((t) => {
      if (!t) return;
      setTitulo(t.title);
      setNotas(t.notes ?? '');
      setPrioridad(t.priority);
      setRepeticion(t.repeat_type);
      setDias((t.repeat_days ?? '').split(',').filter(Boolean).map(Number));
      setHora(t.due_time ?? null);
      setAviso(t.remind_min ?? null);
      if (t.scope === 'semanal') setCuando('semana');
      else if (!t.due_date) setCuando('sin');
      else if (t.due_date === toISODate()) setCuando('hoy');
      else if (t.due_date === toISODate(new Date(Date.now() + 86400000))) setCuando('manana');
      else {
        setCuando('fecha');
        setFecha(fromISODate(t.due_date));
      }
    });
  }, [db, id]);

  const elegirFecha = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fecha,
        mode: 'date',
        onChange: (e, d) => {
          if (e.type === 'set' && d) {
            setFecha(d);
            setCuando('fecha');
          }
        },
      });
    } else {
      setCuando('fecha');
      setMostrarPickerIOS(true);
    }
  };

  const dosD = (n: number) => String(n).padStart(2, '0');
  const ponerHora = (d: Date) => {
    setHora(`${dosD(d.getHours())}:${dosD(d.getMinutes())}`);
    // Al poner una hora, la alarma parte "a la hora" (se puede cambiar o quitar).
    setAviso((a) => a ?? 0);
  };
  const fechaHora = () => {
    const d = new Date();
    const [h, m] = (hora ?? '18:00').split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const elegirHora = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: fechaHora(), mode: 'time', is24Hour: true, onChange: (e, d) => e.type === 'set' && d && ponerHora(d) });
    } else {
      if (!hora) ponerHora(fechaHora());
      setPickerHoraIOS(true);
    }
  };
  // La hora solo tiene sentido si la tarea es de un día concreto (o se repite).
  const admiteHora = repeticion !== 'none' || cuando === 'hoy' || cuando === 'manana' || cuando === 'fecha';

  const valido = titulo.trim().length > 0 && (repeticion !== 'weekdays' || dias.length > 0);

  const guardar = async () => {
    if (!valido) return;
    setGuardando(true);
    const manana = new Date(Date.now() + 86400000);
    const due =
      cuando === 'hoy' ? toISODate()
      : cuando === 'manana' ? toISODate(manana)
      : cuando === 'semana' ? toISODate(endOfWeek())
      : cuando === 'fecha' ? toISODate(fecha)
      : null;
    const datos = {
      title: titulo,
      notes: notas,
      priority: prioridad,
      scope: cuando === 'semana' && repeticion === 'none' ? ('semanal' as const) : ('diaria' as const),
      due_date: due,
      repeat_type: repeticion,
      repeat_days: dias,
      due_time: admiteHora ? hora : null,
      remind_min: admiteHora && hora ? aviso : null,
    };
    try {
      if (id) await actualizarTarea(db, id, datos);
      else await crearTarea(db, datos);
      if (datos.remind_min != null) {
        // Pide permiso de notificaciones la primera vez que pones una alarma.
        prepararNotificaciones(true)
          .then(() => reprogramarTodo(db))
          .catch(() => {});
      } else reprogramarTodo(db).catch(() => {});
      cerrar();
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () => {
    if (!id) return;
    Alert.alert('¿Eliminar tarea?', 'Esto no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarTarea(db, id);
          cerrar();
        },
      },
    ]);
  };

  const colorPrioridad = { alta: colors.danger, media: colors.warning, baja: colors.textTertiary };

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar tarea' : 'Nueva tarea' }} />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Field
          big
          value={titulo}
          onChangeText={setTitulo}
          placeholder="¿Qué hay que hacer?"
          autoFocus={!id}
          returnKeyType="done"
          maxLength={120}
          accessibilityLabel="Título de la tarea"
        />

        <View style={styles.section}>
          <FieldLabel>Prioridad</FieldLabel>
          <View style={styles.chips}>
            {(['alta', 'media', 'baja'] as const).map((p) => (
              <Chip
                key={p}
                label={p[0].toUpperCase() + p.slice(1)}
                selected={prioridad === p}
                onPress={() => setPrioridad(p)}
                leading={<View style={[styles.dot, { backgroundColor: colorPrioridad[p] }]} />}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <FieldLabel>Se repite</FieldLabel>
          <View style={styles.chips}>
            <Chip label="No" selected={repeticion === 'none'} onPress={() => setRepeticion('none')} />
            <Chip label="Todos los días" selected={repeticion === 'daily'} onPress={() => setRepeticion('daily')} />
            <Chip label="Ciertos días" selected={repeticion === 'weekdays'} onPress={() => setRepeticion('weekdays')} />
          </View>
          {repeticion === 'weekdays' ? (
            <View style={[styles.chips, { marginTop: space.md }]}>
              {DIAS_CORTOS.map((d, i) => {
                const n = i + 1;
                const sel = dias.includes(n);
                return (
                  <Chip
                    key={n}
                    compact
                    label={d}
                    accessibilityLabel={DIAS_LARGOS[i]}
                    selected={sel}
                    onPress={() => setDias((ds) => (sel ? ds.filter((x) => x !== n) : [...ds, n]))}
                  />
                );
              })}
            </View>
          ) : null}
        </View>

        {repeticion === 'none' ? (
          <View style={styles.section}>
            <FieldLabel>Cuándo</FieldLabel>
            <View style={styles.chips}>
              <Chip label="Hoy" selected={cuando === 'hoy'} onPress={() => setCuando('hoy')} />
              <Chip label="Mañana" selected={cuando === 'manana'} onPress={() => setCuando('manana')} />
              <Chip label="Esta semana" selected={cuando === 'semana'} onPress={() => setCuando('semana')} />
              <Chip
                label={cuando === 'fecha' ? fechaLarga(fecha) : 'Otra fecha'}
                selected={cuando === 'fecha'}
                onPress={elegirFecha}
              />
              <Chip label="Sin fecha" selected={cuando === 'sin'} onPress={() => setCuando('sin')} />
            </View>
            {mostrarPickerIOS && Platform.OS === 'ios' ? (
              <DateTimePicker
                value={fecha}
                mode="date"
                display="inline"
                onChange={(_, d) => d && setFecha(d)}
              />
            ) : null}
          </View>
        ) : null}

        {admiteHora ? (
          <View style={styles.section}>
            <FieldLabel>Hora y alarma</FieldLabel>
            <View style={styles.chips}>
              <Chip label={hora ? `A las ${hora}` : 'Ponerle hora'} selected={!!hora} onPress={elegirHora} />
              {hora ? (
                <Chip
                  label="Sin hora"
                  onPress={() => {
                    setHora(null);
                    setAviso(null);
                    setPickerHoraIOS(false);
                  }}
                />
              ) : null}
            </View>
            {pickerHoraIOS && hora && Platform.OS === 'ios' ? (
              <DateTimePicker value={fechaHora()} mode="time" display="spinner" onChange={(_, d) => d && ponerHora(d)} />
            ) : null}
            {hora ? (
              <View style={[styles.chips, { marginTop: space.md }]}>
                <Chip label="Sin alarma" selected={aviso == null} onPress={() => setAviso(null)} />
                {AVISOS_TAREA.map((a) => (
                  <Chip key={a.min} label={a.label} selected={aviso === a.min} onPress={() => setAviso(a.min)} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Field
            label="Notas"
            value={notas}
            onChangeText={setNotas}
            placeholder="Opcional"
            multiline
            maxLength={500}
          />
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Agregar tarea'} onPress={guardar} disabled={!valido} loading={guardando} />
          {id ? <Button label="Eliminar" variant="danger" onPress={borrar} /> : null}
          {repeticion === 'weekdays' && dias.length === 0 ? (
            <AppText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              Elige al menos un día.
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
