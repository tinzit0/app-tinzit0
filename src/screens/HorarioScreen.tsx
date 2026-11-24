/**
 * Agenda de ramos.
 * - Semana: grilla tipo horario universitario (lunes a sábado; domingo si tienes clases),
 *   un bloque de color por ramo con nombre, hora, sala y tipo.
 * - Día: las clases de ese día y las tareas que vencen ese día.
 * Tocar un bloque lo edita; el "+" crea uno nuevo.
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { PressableScale } from '@/components/PressableScale';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TaskRow } from '@/components/TaskRow';
import { listarRamosSimple, nombreTipo, todosLosBloques, type BloqueConRamo } from '@/database/estudio';
import { alternarTarea, tareasDelDia, type TareaDelDia } from '@/database/tareas';
import { aMinutos, carriles, diasDeLaSemana, rangoHoras } from '@/estudio/agenda';
import { claseAhora } from '@/estudio/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { nombreDiaMonFirst, startOfWeek, toISODate, weekdayMonFirst } from '@/utils/fechas';

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const PX_HORA = 64;
const EJE = 34;

/** Color del ramo con transparencia, para el fondo del bloque. */
const tinte = (hex: string, alfa: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alfa}` : hex);

type Vista = 'semana' | 'dia';

export function HorarioScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [vista, setVista] = useState<Vista>('semana');
  const [dia, setDia] = useState(weekdayMonFirst());
  const [bloques, setBloques] = useState<BloqueConRamo[]>([]);
  const [tareas, setTareas] = useState<TareaDelDia[]>([]);
  const [hayRamos, setHayRamos] = useState(true);
  const [cargado, setCargado] = useState(false);
  const [ancho, setAncho] = useState(0);

  const hoy = weekdayMonFirst();
  const lunes = startOfWeek();
  const fechaDe = (d: number) => new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + d - 1);

  const cargar = useCallback(async () => {
    const [b, r, t] = await Promise.all([todosLosBloques(db), listarRamosSimple(db), tareasDelDia(db, toISODate(fechaDe(dia)))]);
    setBloques(b);
    setHayRamos(r.length > 0);
    setTareas(t);
    setCargado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, dia]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const { actual } = claseAhora(bloques);
  const nuevo = (extra: Record<string, string> = {}) => {
    if (!hayRamos) {
      Alert.alert('Primero un ramo', 'Crea un ramo y después le agregas sus bloques de clase.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Crear ramo', onPress: () => router.push('/ramo-form') },
      ]);
      return;
    }
    router.push({ pathname: '/bloque', params: extra });
  };
  const editar = (b: BloqueConRamo) => router.push({ pathname: '/bloque', params: { id: String(b.id) } });

  const toggle = async (t: TareaDelDia, hecha: boolean) => {
    setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, hecha } : x)));
    try {
      await alternarTarea(db, t, hecha, toISODate(fechaDe(dia)));
    } catch (e) {
      console.warn(e);
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    }
    cargar().catch(console.warn);
  };

  // ---------- Semana ----------
  const dias = diasDeLaSemana(bloques);
  const { desde, hasta } = rangoHoras(bloques);
  const lanes = carriles(bloques);
  const colAncho = ancho > 0 ? (ancho - EJE) / dias.length : 0;
  const alto = (hasta - desde) * PX_HORA;
  const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();

  const semana = (
    <View onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
      {/* Cabecera con los días */}
      <View style={{ flexDirection: 'row', paddingLeft: EJE, marginBottom: space.sm }}>
        {dias.map((d) => (
          <PressableScale
            key={d}
            accessibilityRole="button"
            accessibilityLabel={`Ver ${nombreDiaMonFirst(d)}`}
            onPress={() => {
              setDia(d);
              setVista('dia');
            }}
            style={{ width: colAncho, alignItems: 'center', paddingVertical: space.xs }}
          >
            <AppText variant="overline" tone={d === hoy ? 'accent' : 'tertiary'}>{CORTO[d]}</AppText>
            <AppText variant="caption" tone={d === hoy ? 'accent' : 'secondary'} tabular>{fechaDe(d).getDate()}</AppText>
          </PressableScale>
        ))}
      </View>

      <View style={{ height: alto, flexDirection: 'row' }}>
        {/* Eje de horas */}
        <View style={{ width: EJE }}>
          {Array.from({ length: hasta - desde }, (_, k) => (
            <AppText key={k} variant="caption" tone="tertiary" tabular style={{ position: 'absolute', top: k * PX_HORA - 7, fontSize: 11 }}>
              {String(desde + k).padStart(2, '0')}
            </AppText>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          {/* Líneas de cada hora */}
          {Array.from({ length: hasta - desde + 1 }, (_, k) => (
            <View key={k} style={[styles.linea, { top: k * PX_HORA, backgroundColor: colors.border }]} />
          ))}
          {/* Hoy, más suave de fondo */}
          {dias.includes(hoy) && colAncho > 0 ? (
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: dias.indexOf(hoy) * colAncho, width: colAncho, backgroundColor: colors.accentSoft, borderRadius: radius.sm }} />
          ) : null}
          {/* Línea de "ahora" */}
          {dias.includes(hoy) && ahoraMin >= desde * 60 && ahoraMin <= hasta * 60 && colAncho > 0 ? (
            <View style={{ position: 'absolute', left: dias.indexOf(hoy) * colAncho, width: colAncho, top: ((ahoraMin - desde * 60) / 60) * PX_HORA - 1, height: 2, backgroundColor: colors.accent }} />
          ) : null}
          {colAncho > 0 &&
            bloques
              .filter((b) => dias.includes(b.weekday))
              .map((b) => {
                const ini = aMinutos(b.start_time);
                const fin = Math.max(aMinutos(b.end_time), ini + 30);
                const l = lanes.get(b.id) ?? { carril: 0, de: 1 };
                const w = colAncho / l.de;
                const h = ((fin - ini) / 60) * PX_HORA;
                const esAhora = actual?.id === b.id;
                return (
                  <PressableScale
                    key={b.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.name}, ${nombreTipo(b.kind)}, ${nombreDiaMonFirst(b.weekday)} de ${b.start_time} a ${b.end_time}${b.sala ? `, sala ${b.sala}` : ''}. Tocar para editar`}
                    onPress={() => editar(b)}
                    style={{
                      position: 'absolute',
                      top: ((ini - desde * 60) / 60) * PX_HORA + 1,
                      left: dias.indexOf(b.weekday) * colAncho + l.carril * w + 1,
                      width: w - 2,
                      height: h - 2,
                      backgroundColor: tinte(b.color, isDark ? '33' : '40'),
                      borderLeftWidth: 3,
                      borderLeftColor: b.color,
                      borderRadius: 6,
                      paddingHorizontal: 3,
                      paddingVertical: 2,
                      overflow: 'hidden',
                      borderWidth: esAhora ? 1 : 0,
                      borderColor: colors.accent,
                    }}
                  >
                    <AppText variant="caption" numberOfLines={h > 70 ? 3 : 2} android_hyphenationFrequency="normal" style={{ fontSize: 10.5, lineHeight: 13, fontFamily: 'Inter_600SemiBold' }}>
                      {b.name}
                    </AppText>
                    {h > 44 ? (
                      <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 9.5, lineHeight: 12 }}>
                        {nombreTipo(b.kind, true)}
                      </AppText>
                    ) : null}
                    {h > 58 && b.sala ? (
                      <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 9.5, lineHeight: 12 }}>
                        {b.sala}
                      </AppText>
                    ) : null}
                    {h > 84 ? (
                      <AppText variant="caption" tone="tertiary" numberOfLines={1} tabular style={{ fontSize: 9.5, lineHeight: 12 }}>
                        {b.start_time}
                      </AppText>
                    ) : null}
                  </PressableScale>
                );
              })}
        </View>
      </View>
      <AppText variant="caption" tone="tertiary" style={{ marginTop: space.lg }}>
        Toca un bloque para editarlo o un día para verlo en detalle.
      </AppText>
    </View>
  );

  // ---------- Día ----------
  const clasesDia = bloques.filter((b) => b.weekday === dia);
  const fechaDia = fechaDe(dia);
  const diaVista = (
    <View>
      <View style={styles.wrap}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <Chip key={d} compact label={d === hoy ? 'Hoy' : CORTO[d]} selected={dia === d} onPress={() => setDia(d)} accessibilityLabel={mayus(nombreDiaMonFirst(d))} />
        ))}
      </View>

      <AppText variant="overline" tone={dia === hoy ? 'accent' : 'tertiary'} style={{ marginTop: space.xxl, marginBottom: space.md }}>
        {`${dia === hoy ? 'Hoy · ' : ''}${mayus(nombreDiaMonFirst(dia))} ${fechaDia.getDate()} · Clases`}
      </AppText>
      {clasesDia.length ? (
        <View style={{ gap: space.sm }}>
          {clasesDia.map((b) => {
            const ahora = actual?.id === b.id;
            return (
              <PressableScale
                accessibilityRole="button"
                key={b.id}
                onPress={() => editar(b)}
                accessibilityLabel={`${b.name}, ${nombreTipo(b.kind)}, de ${b.start_time} a ${b.end_time}. Tocar para editar`}
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
                    {[ahora ? 'Ahora' : null, nombreTipo(b.kind), b.sala ? `Sala ${b.sala}` : null].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
              </PressableScale>
            );
          })}
        </View>
      ) : (
        <AppText variant="callout" tone="secondary">Sin clases este día. Tiempo para ti ✨</AppText>
      )}

      <AppText variant="overline" tone="tertiary" style={{ marginTop: space.xxl, marginBottom: space.md }}>
        Tareas que vencen ese día
      </AppText>
      {tareas.length ? (
        <View style={{ gap: space.sm }}>
          {tareas.map((t) => (
            <TaskRow key={t.id} tarea={t} ocultarHoy={dia === hoy} onToggle={(h) => toggle(t, h)} onPress={() => router.push({ pathname: '/tarea', params: { id: String(t.id) } })} />
          ))}
        </View>
      ) : (
        <AppText variant="callout" tone="secondary">Nada pendiente para ese día.</AppText>
      )}
      <View style={{ marginTop: space.lg }}>
        <Button label="Agregar clase este día" variant="secondary" onPress={() => nuevo({ dia: String(dia) })} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Agenda' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {cargado && !bloques.length && vista === 'semana' ? (
          <View style={{ gap: space.lg }}>
            <EmptyState icon="calendar-outline" title="Tu semana está en blanco" description="Agrega tus clases (cátedra, ayudantía o laboratorio) y te armo el horario. Si quieres, te aviso antes de cada una." />
            <Button label={hayRamos ? 'Agregar primera clase' : 'Crear mi primer ramo'} onPress={() => (hayRamos ? nuevo() : router.push('/ramo-form'))} />
          </View>
        ) : (
          <>
            <View style={{ marginBottom: space.xl }}>
              <SegmentedControl<Vista>
                options={[
                  { value: 'semana', label: 'Semana' },
                  { value: 'dia', label: 'Día' },
                ]}
                value={vista}
                onChange={setVista}
              />
            </View>
            {vista === 'semana' ? semana : diaVista}
          </>
        )}
      </ScrollView>
      {bloques.length ? <Fab accessibilityLabel="Nueva clase" onPress={() => nuevo(vista === 'dia' ? { dia: String(dia) } : {})} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  linea: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  bloque: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  barra: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
});
