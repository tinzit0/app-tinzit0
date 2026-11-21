/**
 * Crear o editar un ramo: nombre, color, profe, sala, nota para aprobar,
 * asistencia mínima y los bloques del horario.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { Stepper } from '@/components/Stepper';
import {
  actualizarRamo,
  bloquesDeRamo,
  COLORES_RAMO,
  crearRamo,
  eliminarRamo,
  guardarBloques,
  obtenerRamo,
  type NuevoBloque,
} from '@/database/estudio';
import { reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const DIAS = [
  { n: 1, c: 'Lun' },
  { n: 2, c: 'Mar' },
  { n: 3, c: 'Mié' },
  { n: 4, c: 'Jue' },
  { n: 5, c: 'Vie' },
  { n: 6, c: 'Sáb' },
  { n: 7, c: 'Dom' },
];

const dosDigitos = (n: number) => String(n).padStart(2, '0');
const aHora = (d: Date) => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
const deHora = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
const sumarMin = (s: string, min: number) => {
  const d = deHora(s);
  d.setMinutes(d.getMinutes() + min);
  return aHora(d);
};

export function RamoFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLORES_RAMO[1]);
  const [profe, setProfe] = useState('');
  const [sala, setSala] = useState('');
  const [aprobar, setAprobar] = useState(4.0);
  const [asistencia, setAsistencia] = useState(75);
  const [bloques, setBloques] = useState<NuevoBloque[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const r = await obtenerRamo(db, id);
      if (!r) return;
      setNombre(r.name);
      setColor(r.color);
      setProfe(r.teacher ?? '');
      setSala(r.room ?? '');
      setAprobar(r.passing);
      setAsistencia(r.min_attendance);
      setBloques((await bloquesDeRamo(db, id)).map((b) => ({ weekday: b.weekday, start_time: b.start_time, end_time: b.end_time, room: b.room })));
    })().catch(console.warn);
  }, [db, id]);

  const elegirHora = (k: number, campo: 'start_time' | 'end_time') => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: deHora(bloques[k][campo]),
      mode: 'time',
      is24Hour: true,
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        setBloques((bs) =>
          bs.map((b, j) => {
            if (j !== k) return b;
            const nuevo = { ...b, [campo]: aHora(d) };
            // Si el inicio queda después del término, movemos el término 90 min después.
            if (campo === 'start_time' && nuevo.end_time <= nuevo.start_time) nuevo.end_time = sumarMin(nuevo.start_time, 90);
            return nuevo;
          }),
        );
      },
    });
  };

  const agregarBloque = () => {
    const ultimo = bloques[bloques.length - 1];
    setBloques((bs) => [...bs, ultimo ? { ...ultimo, weekday: Math.min(7, ultimo.weekday + 2) } : { weekday: 1, start_time: '08:30', end_time: '10:00', room: null }]);
  };

  const guardar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      const datos = { name: nombre, color, teacher: profe, room: sala, passing: aprobar, min_attendance: asistencia };
      const rid = id ?? (await crearRamo(db, datos));
      if (id) await actualizarRamo(db, id, datos);
      await guardarBloques(db, rid, bloques);
      reprogramarTodo(db).catch(() => {}); // avisos antes de cada clase
      if (id) router.back();
      else router.replace({ pathname: '/ramo', params: { id: String(rid) } });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () =>
    Alert.alert('¿Eliminar ramo?', 'Se borran sus notas, asistencia y horario. Las tarjetas quedan, pero sin ramo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (id) await eliminarRamo(db, id);
          reprogramarTodo(db).catch(() => {});
          router.dismissTo('/estudio');
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar ramo' : 'Nuevo ramo' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field big value={nombre} onChangeText={setNombre} placeholder="Nombre del ramo" autoFocus={!id} maxLength={40} accessibilityLabel="Nombre del ramo" />

        <View style={styles.section}>
          <FieldLabel>Color</FieldLabel>
          <View style={styles.wrap}>
            {COLORES_RAMO.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === c }}
                accessibilityLabel={`Color ${c}`}
                hitSlop={4}
                style={[styles.color, { backgroundColor: c, borderColor: color === c ? colors.text : 'transparent' }]}
              />
            ))}
          </View>
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Field label="Profe" value={profe} onChangeText={setProfe} placeholder="Opcional" maxLength={50} />
          <Field label="Sala" value={sala} onChangeText={setSala} placeholder="Ej: B-204" maxLength={20} autoCapitalize="characters" />
        </View>

        <View style={[styles.section, styles.row]}>
          <Stepper label="Nota para aprobar" value={aprobar} onChange={(v) => setAprobar(Math.min(7, Math.max(1, Math.round(v * 10) / 10)))} step={0.1} min={1} decimals fijo={1} />
          <Stepper label="Asistencia mínima" value={asistencia} onChange={(v) => setAsistencia(Math.min(100, v))} step={5} min={0} suffix="%" />
        </View>

        <View style={styles.section}>
          <FieldLabel>Horario</FieldLabel>
          <View style={{ gap: space.md }}>
            {bloques.map((b, k) => (
              <View key={k} style={[styles.bloque, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.wrap}>
                  {DIAS.map((d) => (
                    <Chip key={d.n} compact label={d.c} selected={b.weekday === d.n} onPress={() => setBloques((bs) => bs.map((x, j) => (j === k ? { ...x, weekday: d.n } : x)))} />
                  ))}
                </View>
                <View style={[styles.row, { marginTop: space.md }]}>
                  <Pressable onPress={() => elegirHora(k, 'start_time')} accessibilityLabel="Hora de inicio" style={[styles.hora, { backgroundColor: colors.surfaceRaised }]}>
                    <AppText variant="caption" tone="tertiary">Desde</AppText>
                    <AppText variant="headline" tabular>{b.start_time}</AppText>
                  </Pressable>
                  <Pressable onPress={() => elegirHora(k, 'end_time')} accessibilityLabel="Hora de término" style={[styles.hora, { backgroundColor: colors.surfaceRaised }]}>
                    <AppText variant="caption" tone="tertiary">Hasta</AppText>
                    <AppText variant="headline" tabular>{b.end_time}</AppText>
                  </Pressable>
                  <Pressable onPress={() => setBloques((bs) => bs.filter((_, j) => j !== k))} accessibilityLabel="Quitar bloque" hitSlop={8} style={styles.quitar}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
            <Button label="Agregar bloque de clase" variant="secondary" onPress={agregarBloque} />
          </View>
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
            Te aviso unos minutos antes de cada clase (lo cambias en Ajustes → Notificaciones).
          </AppText>
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Crear ramo'} onPress={guardar} disabled={!nombre.trim()} loading={guardando} />
          {id ? <Button label="Eliminar ramo" variant="danger" onPress={borrar} /> : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  color: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  bloque: { padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  hora: { flex: 1, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, minHeight: 52, justifyContent: 'center' },
  quitar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
