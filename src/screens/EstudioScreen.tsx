/**
 * Modo Estudiante: la clase de ahora, tus próximas pruebas, tus ramos con su promedio
 * y acceso a las herramientas (horario, enfoque, tarjetas, grabar clase, escanear).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { PressableScale } from '@/components/PressableScale';
import {
  contarPendientes,
  listarRamos,
  minutosEstudio,
  proximasEvaluaciones,
  todosLosBloques,
  type BloqueConRamo,
  type EvaluacionConRamo,
  type RamoResumen,
} from '@/database/estudio';
import { rangoSemana } from '@/database/gastos';
import { claseAhora, formatoHoras, formatoNota, redondearNota } from '@/estudio/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaCorta, fromISODate, nombreDiaMonFirst, toISODate } from '@/utils/fechas';

type Icono = keyof typeof Ionicons.glyphMap;

const HERRAMIENTAS: { icon: Icono; label: string; ruta: string }[] = [
  { icon: 'calendar-outline', label: 'Horario', ruta: '/horario' },
  { icon: 'timer-outline', label: 'Enfoque', ruta: '/pomodoro' },
  { icon: 'albums-outline', label: 'Tarjetas', ruta: '/tarjetas' },
  { icon: 'mic-outline', label: 'Grabar clase', ruta: '/grabar' },
  { icon: 'scan-outline', label: 'Escanear', ruta: '/escanear' },
  { icon: 'document-text-outline', label: 'Nueva prueba', ruta: '/evaluacion' },
  { icon: 'flash-outline', label: 'Repasar', ruta: '/repaso' },
  { icon: 'location-outline', label: 'Asistencia', ruta: '/campus' },
  { icon: 'add-circle-outline', label: 'Nuevo ramo', ruta: '/ramo-form' },
];

function diasHasta(iso: string) {
  return Math.round((fromISODate(iso).getTime() - fromISODate(toISODate()).getTime()) / 86400000);
}

const mayusDia = (n: number) => { const d = nombreDiaMonFirst(n); return d.charAt(0).toUpperCase() + d.slice(1); };

export function EstudioScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [ramos, setRamos] = useState<RamoResumen[]>([]);
  const [bloques, setBloques] = useState<BloqueConRamo[]>([]);
  const [pruebas, setPruebas] = useState<EvaluacionConRamo[]>([]);
  const [minutos, setMinutos] = useState(0);
  const [tarjetas, setTarjetas] = useState(0);
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const semana = rangoSemana(new Date());
      Promise.all([listarRamos(db), todosLosBloques(db), proximasEvaluaciones(db, 21), minutosEstudio(db, semana.desde, semana.hasta), contarPendientes(db)])
        .then(([r, b, p, m, c]) => {
          setRamos(r);
          setBloques(b);
          setPruebas(p.filter((e) => e.grade == null));
          setMinutos(m.total);
          setTarjetas(c.reduce((s, x) => s + x.pendientes, 0));
          setCargado(true);
        })
        .catch(console.warn);
    }, [db]),
  );

  const { actual, siguiente } = claseAhora(bloques);
  const conNota = ramos.filter((r) => r.promedio != null);
  const general = conNota.length ? conNota.reduce((s, r) => s + (r.promedio ?? 0), 0) / conNota.length : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Estudio' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {/* Números grandes: promedio general y horas de la semana */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <AppText variant="overline" tone="tertiary">Promedio general</AppText>
            <AppText variant="display" tabular style={{ marginTop: space.xs }}>{formatoNota(general)}</AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="overline" tone="tertiary">Estudio semana</AppText>
            <AppText variant="display" tabular style={{ marginTop: space.xs }}>{minutos ? formatoHoras(minutos / 60) : '0 h'}</AppText>
          </View>
        </View>

        {/* Clase de ahora / siguiente */}
        {actual || siguiente ? (
          <Card onPress={() => router.push('/horario')} accessibilityLabel="Ver horario" style={{ marginTop: space.xxl }}>
            <AppText variant="overline" tone={actual ? 'accent' : 'tertiary'}>{actual ? 'Ahora' : 'Tu próxima clase'}</AppText>
            {(() => {
              const b = actual ?? siguiente!;
              const cuando = actual
                ? `Hasta las ${actual.end_time}`
                : siguiente!.enDias === 0
                  ? `Hoy · ${siguiente!.start_time}`
                  : siguiente!.enDias === 1
                    ? `Mañana · ${siguiente!.start_time}`
                    : `${mayusDia(siguiente!.weekday)} · ${siguiente!.start_time}`;
              return (
                <View style={[styles.row, { marginTop: space.md }]}>
                  <View style={[styles.barra, { backgroundColor: b.color }]} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="title" numberOfLines={1}>{b.name}</AppText>
                    <AppText variant="callout" tone="secondary" style={{ marginTop: 2 }}>
                      {cuando}{b.sala ? ` · Sala ${b.sala}` : ''}
                    </AppText>
                  </View>
                </View>
              );
            })()}
            {actual && siguiente ? (
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.md }}>
                Después: {siguiente.name} a las {siguiente.start_time}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        {/* Herramientas */}
        <View style={styles.grid}>
          {HERRAMIENTAS.map((h) => (
            <PressableScale
              accessibilityRole="button"
              key={h.ruta}
              onPress={() => router.push(h.ruta as never)}
              accessibilityLabel={h.label}
              style={[styles.tool, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name={h.icon} size={22} color={colors.accent} />
              <AppText variant="caption" numberOfLines={1}>{h.label}</AppText>
              {h.ruta === '/tarjetas' && tarjetas > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <AppText variant="caption" tone="onAccent" tabular style={{ fontSize: 11, lineHeight: 14 }}>{tarjetas}</AppText>
                </View>
              ) : null}
            </PressableScale>
          ))}
        </View>

        {/* Próximas evaluaciones */}
        {pruebas.length ? (
          <View style={{ marginTop: space.xxl }}>
            <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Próximas evaluaciones</AppText>
            <Card style={{ paddingVertical: space.sm }}>
              {pruebas.slice(0, 6).map((e, k) => {
                const d = diasHasta(e.date ?? toISODate());
                return (
                  <PressableScale
              accessibilityRole="button"
                    key={e.id}
                    onPress={() => router.push({ pathname: '/evaluacion', params: { id: String(e.id) } })}
                    accessibilityLabel={`${e.name} de ${e.ramo}`}
                    style={[styles.item, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                  >
                    <View style={[styles.punto, { backgroundColor: e.color }]} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="callout" numberOfLines={1}>{e.name}</AppText>
                      <AppText variant="caption" tone="tertiary" numberOfLines={1}>{e.ramo} · {fechaCorta(fromISODate(e.date ?? toISODate()))}</AppText>
                    </View>
                    <AppText variant="callout" tone={d <= 2 ? 'warning' : 'secondary'} tabular>
                      {d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `${d} días`}
                    </AppText>
                  </PressableScale>
                );
              })}
            </Card>
          </View>
        ) : null}

        {/* Ramos */}
        <View style={{ marginTop: space.xxl }}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Tus ramos</AppText>
          {cargado && !ramos.length ? (
            <View style={{ gap: space.lg }}>
              <EmptyState
                icon="school-outline"
                title="Agrega tus ramos"
                description="Pon el nombre, la sala y el horario. Después anota tus notas y te digo cuánto necesitas para pasar."
              />
              <Button label="Agregar mi primer ramo" onPress={() => router.push('/ramo-form')} />
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              {ramos.map((r) => {
                const rojo = r.promedio != null && redondearNota(r.promedio) < r.passing;
                const asisRiesgo = r.asistencia != null && r.asistencia < r.min_attendance;
                return (
                  <Card key={r.id} onPress={() => router.push({ pathname: '/ramo', params: { id: String(r.id) } })} accessibilityLabel={`Ramo ${r.name}`}>
                    <View style={styles.row}>
                      <View style={[styles.barra, { backgroundColor: r.color }]} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="headline" numberOfLines={1}>{r.name}</AppText>
                        <AppText variant="caption" tone={asisRiesgo ? 'warning' : 'tertiary'} style={{ marginTop: 2 }} numberOfLines={1}>
                          {r.evaluaciones ? `${r.evaluaciones} ${r.evaluaciones === 1 ? 'evaluación' : 'evaluaciones'}` : 'Sin evaluaciones'}
                          {r.asistencia != null ? ` · ${r.asistencia}% asistencia` : ''}
                        </AppText>
                      </View>
                      <AppText variant="number" tabular tone={r.promedio == null ? 'tertiary' : rojo ? 'danger' : 'primary'}>
                        {formatoNota(r.promedio)}
                      </AppText>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  barra: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 36 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xxl },
  tool: {
    width: '31.5%',
    flexGrow: 1,
    aspectRatio: 1.15,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xs,
  },
  badge: { position: 'absolute', top: space.sm, right: space.sm, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  punto: { width: 10, height: 10, borderRadius: 5 },
});
