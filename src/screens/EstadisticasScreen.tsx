/**
 * Estadísticas del mes, con comparación con el mes anterior.
 * Usa las flechas para ver meses anteriores.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { DonutChart } from '@/components/DonutChart';
import { compararMes, type ComparacionMes } from '@/database/estadisticas';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { formatCLP } from '@/utils/moneda';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export function EstadisticasScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const hoy = new Date();
  const [mes, setMes] = useState({ anio: hoy.getFullYear(), mes0: hoy.getMonth() });
  const [datos, setDatos] = useState<ComparacionMes | null>(null);

  useEffect(() => {
    setDatos(null);
    compararMes(db, mes.anio, mes.mes0).then(setDatos).catch(console.warn);
  }, [db, mes]);

  const mover = (d: number) => {
    const f = new Date(mes.anio, mes.mes0 + d, 1);
    setMes({ anio: f.getFullYear(), mes0: f.getMonth() });
  };
  const esMesActual = mes.anio === hoy.getFullYear() && mes.mes0 === hoy.getMonth();
  const nombreAnterior = MESES[(mes.mes0 + 11) % 12].toLowerCase();

  const a = datos?.actual;
  const b = datos?.anterior;
  const totalTareas = a ? a.tareasHechas + a.tareasPendientes : 0;
  const pctTareas = totalTareas ? a!.tareasHechas / totalTareas : 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Estadísticas' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {/* Selector de mes */}
        <View style={styles.mesRow}>
          <Pressable onPress={() => mover(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mes anterior" style={styles.flecha}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <AppText variant="title">{MESES[mes.mes0]} {mes.anio !== hoy.getFullYear() ? mes.anio : ''}</AppText>
          <Pressable
            onPress={() => mover(1)}
            disabled={esMesActual}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            style={[styles.flecha, { opacity: esMesActual ? 0.25 : 1 }]}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>

        {!a || !b ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxxl }} />
        ) : (
          <>
            {/* Cifras principales, comparadas con el mes anterior */}
            <View style={styles.tiles}>
              <Tile label="Tareas hechas" valor={String(a.tareasHechas)} dif={a.tareasHechas - b.tareasHechas} mejorSiSube />
              <Tile label="Días de gym" valor={String(a.diasGym.length)} dif={a.diasGym.length - b.diasGym.length} mejorSiSube />
              <Tile
                label="Gastado"
                valor={formatCLP(a.gastoTotal)}
                dif={a.gastoTotal - b.gastoTotal}
                formato={(n) => formatCLP(Math.abs(n))}
                mejorSiSube={false}
              />
              <Tile
                label="Hábitos"
                valor={`${Math.round(a.habitosPct * 100)}%`}
                dif={Math.round((a.habitosPct - b.habitosPct) * 100)}
                formato={(n) => `${Math.abs(n)} pts`}
                mejorSiSube
              />
            </View>
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm, marginLeft: space.xs }}>
              Flechas: comparado con {nombreAnterior}.
            </AppText>

            {/* Tareas cumplidas vs pendientes */}
            <Card style={styles.card}>
              <AppText variant="overline" tone="tertiary">Tareas</AppText>
              <AppText variant="headline" style={{ marginTop: space.sm }}>
                {totalTareas === 0 ? 'Sin tareas este mes' : `Cumpliste el ${Math.round(pctTareas * 100)}%`}
              </AppText>
              {totalTareas > 0 ? (
                <>
                  <View style={[styles.barra, { backgroundColor: colors.surfaceRaised }]}>
                    <View style={{ flex: Math.max(a.tareasHechas, 0.0001), backgroundColor: colors.accent, borderRadius: 4 }} />
                    {a.tareasPendientes > 0 ? <View style={{ width: 2 }} /> : null}
                    <View style={{ flex: a.tareasPendientes, backgroundColor: 'transparent' }} />
                  </View>
                  <View style={styles.leyenda}>
                    <Leyenda color={colors.accent} texto={`${a.tareasHechas} hechas`} />
                    <Leyenda color={colors.surfaceRaised} borde={colors.textTertiary} texto={`${a.tareasPendientes} sin hacer`} />
                  </View>
                </>
              ) : null}
            </Card>

            {/* Gym: calendario del mes */}
            <Card style={styles.card}>
              <AppText variant="overline" tone="tertiary">Gym</AppText>
              <AppText variant="headline" style={{ marginTop: space.sm, marginBottom: space.md }}>
                {a.diasGym.length === 0 ? 'Este mes aún no entrenas' : a.diasGym.length === 1 ? '1 día entrenado' : `${a.diasGym.length} días entrenados`}
              </AppText>
              <Calendario anio={mes.anio} mes0={mes.mes0} marcados={new Set(a.diasGym)} />
            </Card>

            {/* Gasto por categoría */}
            <Card style={styles.card}>
              <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.lg }}>Gasto por categoría</AppText>
              <DonutChart datos={a.porCategoria} />
            </Card>

            {/* Hábitos */}
            {a.habitos.length > 0 ? (
              <Card style={styles.card}>
                <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.lg }}>Hábitos</AppText>
                <View style={{ gap: space.lg }}>
                  {a.habitos.map((h) => {
                    const pct = a.diasContados ? Math.min(1, h.dias / a.diasContados) : 0;
                    return (
                      <View key={h.id} style={{ gap: space.sm }}>
                        <View style={styles.rowBetween}>
                          <AppText variant="callout" numberOfLines={1} style={{ flex: 1 }}>{h.name}</AppText>
                          <AppText variant="caption" tone="secondary" tabular>
                            {h.dias}/{a.diasContados} días · {Math.round(pct * 100)}%
                          </AppText>
                        </View>
                        <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
                          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: h.color }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

/** Cifra con flecha de comparación. El color dice si el cambio es bueno o malo. */
function Tile({
  label,
  valor,
  dif,
  mejorSiSube,
  formato = (n: number) => String(Math.abs(n)),
}: {
  label: string;
  valor: string;
  dif: number;
  mejorSiSube: boolean;
  formato?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const bueno = dif === 0 ? null : (dif > 0) === mejorSiSube;
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="overline" tone="tertiary" numberOfLines={1}>{label}</AppText>
      <AppText variant="title" tabular numberOfLines={1} adjustsFontSizeToFit>{valor}</AppText>
      <AppText variant="caption" tone={bueno === null ? 'tertiary' : bueno ? 'accent' : 'danger'} tabular numberOfLines={1}>
        {dif === 0 ? '= igual' : `${dif > 0 ? '▲' : '▼'} ${formato(dif)}`}
      </AppText>
    </View>
  );
}

function Leyenda({ color, borde, texto }: { color: string; borde?: string; texto: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, borderWidth: borde ? 1 : 0, borderColor: borde }} />
      <AppText variant="caption" tone="secondary">{texto}</AppText>
    </View>
  );
}

/** Calendario del mes con los días marcados (lunes primero). */
function Calendario({ anio, mes0, marcados }: { anio: number; mes0: number; marcados: Set<string> }) {
  const { colors } = useTheme();
  const primero = new Date(anio, mes0, 1);
  const offset = (primero.getDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(anio, mes0 + 1, 0).getDate();
  const celdas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];
  const iso = (d: number) => `${anio}-${String(mes0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <View>
      <View style={styles.calRow}>
        {DIAS.map((d, i) => (
          <AppText key={i} variant="caption" tone="tertiary" style={styles.calCell}>{d}</AppText>
        ))}
      </View>
      <View style={[styles.calRow, { flexWrap: 'wrap' }]}>
        {celdas.map((d, i) => {
          const on = d !== null && marcados.has(iso(d));
          return (
            <View key={i} style={styles.calCell}>
              {d !== null ? (
                <View style={[styles.calDia, on && { backgroundColor: colors.accent }]}>
                  <AppText variant="caption" style={{ color: on ? colors.onAccent : colors.textSecondary }} tabular>{d}</AppText>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  mesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl },
  flecha: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48.6%', borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: 2 },
  card: { marginTop: space.md },
  barra: { flexDirection: 'row', height: 10, borderRadius: 4, overflow: 'hidden', marginTop: space.md },
  leyenda: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  calRow: { flexDirection: 'row' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingVertical: 3 },
  calDia: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
