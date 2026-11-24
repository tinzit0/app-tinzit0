/**
 * Crear o editar un bloque de clase desde la Agenda: ramo, día, hora de inicio y término,
 * sala y tipo (cátedra, ayudantía o laboratorio). El color es el del ramo (se puede cambiar aquí).
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import {
  actualizarBloque,
  cambiarColorRamo,
  COLORES_RAMO,
  crearBloque,
  eliminarBloque,
  listarRamosSimple,
  obtenerBloque,
  TIPOS_BLOQUE,
  type Ramo,
  type TipoBloque,
} from '@/database/estudio';
import { aMinutos } from '@/estudio/agenda';
import { reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const dos = (n: number) => String(n).padStart(2, '0');
const aHora = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const deHora = (s: string) => {
  const d = new Date();
  d.setHours(Math.floor(aMinutos(s) / 60), aMinutos(s) % 60, 0, 0);
  return d;
};
const sumarMin = (s: string, min: number) => {
  const t = Math.min(23 * 60 + 59, aMinutos(s) + min);
  return `${dos(Math.floor(t / 60))}:${dos(t % 60)}`;
};

export function BloqueFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; dia?: string; ramo?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [ramoId, setRamoId] = useState<number | null>(params.ramo ? Number(params.ramo) : null);
  const [color, setColor] = useState<string | null>(null);
  const [dia, setDia] = useState(params.dia ? Number(params.dia) : 1);
  const [inicio, setInicio] = useState('08:30');
  const [fin, setFin] = useState('10:00');
  const [sala, setSala] = useState('');
  const [tipo, setTipo] = useState<TipoBloque>('catedra');
  const [editando, setEditando] = useState<'inicio' | 'fin' | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const rs = await listarRamosSimple(db);
      setRamos(rs);
      if (id) {
        const b = await obtenerBloque(db, id);
        if (!b) return;
        setRamoId(b.course_id);
        setDia(b.weekday);
        setInicio(b.start_time);
        setFin(b.end_time);
        setSala(b.room ?? '');
        setTipo(b.kind ?? 'catedra');
      } else if (!params.ramo && rs.length) {
        setRamoId(rs[0].id);
      }
    })().catch(console.warn);
  }, [db, id, params.ramo]);

  const ramo = ramos.find((r) => r.id === ramoId) ?? null;
  const colorActual = color ?? ramo?.color ?? COLORES_RAMO[0];
  const valido = ramoId != null && aMinutos(fin) > aMinutos(inicio);

  const ponerHora = (campo: 'inicio' | 'fin', d: Date) => {
    const h = aHora(d);
    if (campo === 'inicio') {
      setInicio(h);
      if (aMinutos(fin) <= aMinutos(h)) setFin(sumarMin(h, 90));
    } else setFin(h);
  };

  const elegirHora = (campo: 'inicio' | 'fin') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: deHora(campo === 'inicio' ? inicio : fin),
        mode: 'time',
        is24Hour: true,
        onChange: (e, d) => {
          if (e.type === 'set' && d) ponerHora(campo, d);
        },
      });
    } else setEditando(editando === campo ? null : campo);
  };

  const guardar = async () => {
    if (!valido || ramoId == null) return;
    setGuardando(true);
    try {
      const datos = { weekday: dia, start_time: inicio, end_time: fin, room: sala, kind: tipo };
      if (id) await actualizarBloque(db, id, ramoId, datos);
      else await crearBloque(db, ramoId, datos);
      if (color && ramo && color !== ramo.color) await cambiarColorRamo(db, ramoId, color);
      reprogramarTodo(db).catch(() => {});
      router.back();
    } catch (e) {
      console.warn(e);
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () =>
    Alert.alert('¿Quitar esta clase?', 'Se quita solo este bloque del horario. El ramo y sus notas quedan igual.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          if (id) await eliminarBloque(db, id);
          reprogramarTodo(db).catch(() => {});
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar clase' : 'Nueva clase' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FieldLabel>Ramo</FieldLabel>
        <View style={styles.wrap}>
          {ramos.map((r) => (
            <Chip
              key={r.id}
              label={r.name}
              selected={ramoId === r.id}
              onPress={() => {
                setRamoId(r.id);
                setColor(null);
              }}
              leading={<View style={[styles.punto, { backgroundColor: r.id === ramoId ? colorActual : r.color }]} />}
            />
          ))}
          <Chip label="+ Nuevo ramo" onPress={() => router.push('/ramo-form')} />
        </View>

        {ramo ? (
          <View style={styles.section}>
            <FieldLabel>Color del ramo</FieldLabel>
            <View style={styles.wrap}>
              {COLORES_RAMO.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: colorActual === c }}
                  accessibilityLabel={`Color ${c}`}
                  hitSlop={4}
                  style={[styles.color, { backgroundColor: c, borderColor: colorActual === c ? colors.text : 'transparent' }]}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <FieldLabel>Tipo</FieldLabel>
          <View style={styles.wrap}>
            {TIPOS_BLOQUE.map((t) => (
              <Chip key={t.value} label={t.label} selected={tipo === t.value} onPress={() => setTipo(t.value)} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <FieldLabel>Día</FieldLabel>
          <View style={styles.wrap}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <Chip key={d} compact label={DIAS[d]} selected={dia === d} onPress={() => setDia(d)} />
            ))}
          </View>
        </View>

        <View style={[styles.section, styles.row]}>
          <Pressable onPress={() => elegirHora('inicio')} accessibilityRole="button" accessibilityLabel={`Hora de inicio ${inicio}`} style={[styles.hora, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="caption" tone="tertiary">Desde</AppText>
            <AppText variant="title" tabular>{inicio}</AppText>
          </Pressable>
          <Pressable onPress={() => elegirHora('fin')} accessibilityRole="button" accessibilityLabel={`Hora de término ${fin}`} style={[styles.hora, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="caption" tone="tertiary">Hasta</AppText>
            <AppText variant="title" tabular>{fin}</AppText>
          </Pressable>
        </View>
        {editando && Platform.OS !== 'android' ? (
          <DateTimePicker value={deHora(editando === 'inicio' ? inicio : fin)} mode="time" is24Hour display="spinner" onChange={(_, d) => d && ponerHora(editando, d)} />
        ) : null}
        {!valido && ramoId != null ? (
          <AppText variant="caption" tone="danger" style={{ marginTop: space.sm }}>La hora de término tiene que ser después del inicio.</AppText>
        ) : null}

        <View style={styles.section}>
          <Field label="Sala" value={sala} onChangeText={setSala} placeholder={ramo?.room ? `Si la dejas vacía: ${ramo.room}` : 'Ej: B-204'} maxLength={20} autoCapitalize="characters" />
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Agregar clase'} onPress={guardar} disabled={!valido} loading={guardando} />
          {id ? <Button label="Quitar esta clase" variant="danger" onPress={borrar} /> : null}
        </View>
        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.lg }}>
          El aviso antes de cada clase se activa o se apaga en Ajustes → Notificaciones.
        </AppText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.md },
  punto: { width: 10, height: 10, borderRadius: 5 },
  color: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  hora: { flex: 1, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, minHeight: 72, justifyContent: 'center' },
});
