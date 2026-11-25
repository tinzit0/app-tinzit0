/**
 * Un ramo: promedio, "¿cuánto necesito?", evaluaciones, asistencia y horario.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { PressableScale } from '@/components/PressableScale';
import {
  asistenciaDeRamo,
  bloquesDeRamo,
  evaluacionesDeRamo,
  marcarAsistencia,
  nombreTipo,
  obtenerRamo,
  quitarAsistencia,
  resumenRamo,
  subnotasDeRamo,
  type Bloque,
  type Evaluacion,
  type RamoResumen,
} from '@/database/estudio';
import { formatoNota, notaDeSubnotas, textoNecesaria } from '@/estudio/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaCorta, fromISODate, nombreDiaMonFirst, toISODate } from '@/utils/fechas';

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function RamoScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const [ramo, setRamo] = useState<RamoResumen | null>(null);
  const [evals, setEvals] = useState<Evaluacion[]>([]);
  const [subnotas, setSubnotas] = useState<Evaluacion[]>([]);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [hoyMarcado, setHoyMarcado] = useState<boolean | null>(null);

  const cargar = useCallback(async () => {
    const r = await obtenerRamo(db, id);
    if (!r) return;
    const [res, e, b, a, s] = await Promise.all([resumenRamo(db, r), evaluacionesDeRamo(db, id), bloquesDeRamo(db, id), asistenciaDeRamo(db, id), subnotasDeRamo(db, id)]);
    setRamo(res);
    setEvals(e);
    setSubnotas(s);
    setBloques(b);
    const hoy = a.find((x) => x.date === toISODate());
    setHoyMarcado(hoy ? hoy.present === 1 : null);
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const asistencia = async (presente: boolean) => {
    if (hoyMarcado === presente) await quitarAsistencia(db, id);
    else await marcarAsistencia(db, id, presente);
    Haptics.selectionAsync().catch(() => {});
    await cargar();
  };

  if (!ramo) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const n = ramo.necesaria;
  const asisRiesgo = ramo.asistencia != null && ramo.asistencia < ramo.min_attendance;
  const pesoTotal = evals.reduce((s, e) => s + e.weight, 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: ramo.name,
          headerRight: () => (
            <IconButton icon="create-outline" accessibilityLabel="Editar ramo" onPress={() => router.push({ pathname: '/ramo-form', params: { id: String(id) } })} />
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {/* Promedio + lo que necesitas */}
        <View style={styles.row}>
          <View style={[styles.barra, { backgroundColor: ramo.color }]} />
          <View style={{ flex: 1 }}>
            <AppText variant="overline" tone="tertiary">Promedio</AppText>
            <AppText variant="display" tabular>{formatoNota(ramo.promedio)}</AppText>
          </View>
          {n.estado === 'necesita' || n.estado === 'imposible' ? (
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="overline" tone="tertiary">Necesitas</AppText>
              <AppText variant="display" tabular tone={n.estado === 'imposible' ? 'danger' : 'warning'}>{formatoNota(n.necesaria)}</AppText>
            </View>
          ) : null}
        </View>
        <Card style={[styles.aviso, { backgroundColor: n.estado === 'imposible' ? colors.dangerSoft : n.estado === 'necesita' ? colors.warningSoft : colors.accentSoft, borderColor: 'transparent' }]}>
          <Ionicons
            name={n.estado === 'imposible' ? 'alert-circle-outline' : n.estado === 'necesita' ? 'calculator-outline' : 'checkmark-circle-outline'}
            size={20}
            color={n.estado === 'imposible' ? colors.danger : n.estado === 'necesita' ? colors.warning : colors.accent}
          />
          <AppText variant="callout" style={{ flex: 1 }}>{textoNecesaria(n, ramo.passing)}</AppText>
        </Card>

        {/* Evaluaciones */}
        <View style={styles.seccion}>
          <View style={styles.cabecera}>
            <AppText variant="overline" tone="tertiary">Evaluaciones</AppText>
            {pesoTotal > 0 ? (
              <AppText variant="caption" tone={pesoTotal === 100 ? 'tertiary' : 'warning'} tabular>Ponderación total {Math.round(pesoTotal)}%</AppText>
            ) : null}
          </View>
          {evals.length ? (
            <Card style={{ paddingVertical: space.sm }}>
              {evals.map((e, k) => {
                const hijas = subnotas.filter((s) => s.parent_id === e.id);
                const sub = hijas.length ? notaDeSubnotas(hijas) : null;
                // Con subnotas a medias mostramos cómo vas (en gris), sin que cuente todavía.
                const mostrar = e.grade ?? sub?.parcial ?? null;
                return (
                  <View key={e.id} style={k > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}>
                    <PressableScale
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/evaluacion', params: { id: String(e.id) } })}
                      accessibilityLabel={`${e.name}, nota ${formatoNota(mostrar)}${sub && e.grade == null ? ', parcial' : ''}`}
                      style={styles.item}
                    >
                      <View style={{ flex: 1 }}>
                        <AppText variant="callout" numberOfLines={1}>{e.name}</AppText>
                        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                          {[
                            e.weight > 0 ? `${Math.round(e.weight)}%` : null,
                            sub ? `${sub.conNota} de ${sub.total} ${sub.total === 1 ? 'subnota' : 'subnotas'}` : null,
                            e.date ? fechaCorta(fromISODate(e.date)) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Sin ponderación'}
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {sub && e.grade == null && sub.parcial != null ? (
                          <AppText variant="caption" tone="tertiary">vas en</AppText>
                        ) : null}
                        <AppText variant="headline" tabular tone={e.grade == null ? 'tertiary' : e.grade < ramo.passing ? 'danger' : 'primary'}>
                          {formatoNota(mostrar)}
                        </AppText>
                      </View>
                    </PressableScale>
                    {hijas.map((s) => (
                      <PressableScale
                        key={s.id}
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/evaluacion', params: { id: String(s.id) } })}
                        accessibilityLabel={`Subnota ${s.name} de ${e.name}, nota ${formatoNota(s.grade)}`}
                        style={[styles.subitem, { borderLeftColor: ramo.color }]}
                      >
                        <View style={{ flex: 1 }}>
                          <AppText variant="caption" numberOfLines={1}>{s.name}</AppText>
                          {s.weight > 0 || s.date ? (
                            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                              {[s.weight > 0 ? `${Math.round(s.weight)}% de ${e.name}` : null, s.date ? fechaCorta(fromISODate(s.date)) : null].filter(Boolean).join(' · ')}
                            </AppText>
                          ) : null}
                        </View>
                        <AppText variant="callout" tabular tone={s.grade == null ? 'tertiary' : s.grade < ramo.passing ? 'danger' : 'secondary'}>
                          {formatoNota(s.grade)}
                        </AppText>
                      </PressableScale>
                    ))}
                  </View>
                );
              })}
            </Card>
          ) : (
            <AppText variant="callout" tone="secondary">Agrega tus pruebas, controles y trabajos con su ponderación.</AppText>
          )}
          <Button label="Agregar evaluación" variant="secondary" onPress={() => router.push({ pathname: '/evaluacion', params: { ramo: String(id) } })} style={{ marginTop: space.md }} />
        </View>

        {/* Asistencia */}
        <View style={styles.seccion}>
          <View style={styles.cabecera}>
            <AppText variant="overline" tone="tertiary">Asistencia</AppText>
            <AppText variant="caption" tone={asisRiesgo ? 'warning' : 'tertiary'} tabular>
              {ramo.asistencia != null ? `${ramo.asistencia}% · ${ramo.faltas} ${ramo.faltas === 1 ? 'falta' : 'faltas'} · mínimo ${ramo.min_attendance}%` : `Mínimo ${ramo.min_attendance}%`}
            </AppText>
          </View>
          <View style={styles.row}>
            <Button label={hoyMarcado === true ? '✓ Fui hoy' : 'Fui hoy'} variant={hoyMarcado === true ? 'primary' : 'secondary'} onPress={() => asistencia(true)} style={{ flex: 1 }} />
            <Button label={hoyMarcado === false ? '✓ Falté hoy' : 'Falté hoy'} variant={hoyMarcado === false ? 'danger' : 'secondary'} onPress={() => asistencia(false)} style={{ flex: 1 }} />
          </View>
          {asisRiesgo ? (
            <AppText variant="caption" tone="warning" style={{ marginTop: space.sm }}>
              Estás bajo el mínimo. Ojo con las próximas clases.
            </AppText>
          ) : null}
        </View>

        {/* Horario */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Horario</AppText>
          {bloques.length ? (
            <View style={{ gap: space.sm }}>
              {bloques.map((b) => (
                <View key={b.id} style={[styles.bloque, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <AppText variant="callout" style={{ width: 92 }}>{mayus(nombreDiaMonFirst(b.weekday))}</AppText>
                  <View style={{ flex: 1 }}>
                    <AppText variant="callout" tone="secondary" tabular>{b.start_time} – {b.end_time}</AppText>
                    <AppText variant="caption" tone="tertiary">{nombreTipo(b.kind)}</AppText>
                  </View>
                  {b.room || ramo.room ? <AppText variant="caption" tone="tertiary">Sala {b.room ?? ramo.room}</AppText> : null}
                </View>
              ))}
            </View>
          ) : (
            <AppText variant="callout" tone="secondary">Sin horario. Toca el lápiz arriba para agregar los bloques de clase.</AppText>
          )}
          {ramo.teacher ? (
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.md }}>Profe: {ramo.teacher}</AppText>
          ) : null}
        </View>

        {/* Atajos */}
        <View style={[styles.seccion, styles.row]}>
          <Button label="Estudiar" onPress={() => router.push({ pathname: '/pomodoro', params: { ramo: String(id) } })} style={{ flex: 1 }} />
          <Button label="Tarjetas" variant="secondary" onPress={() => router.push({ pathname: '/tarjetas', params: { ramo: String(id) } })} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  barra: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, marginTop: space.lg },
  seccion: { marginTop: space.xxl },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md, gap: space.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  subitem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingLeft: space.md, marginLeft: space.xs, marginBottom: space.xs, borderLeftWidth: 2 },
  bloque: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1 },
});
