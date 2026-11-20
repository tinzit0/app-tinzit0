/**
 * Pantalla de Gastos:
 * - Total de la semana o del mes (con comparación con el periodo anterior)
 * - Presupuesto semanal con barra y aviso
 * - Gasto por categoría
 * - Lista de movimientos agrupada por día
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { CategoryIcon } from '@/components/CategoryIcon';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  gastosEnRango,
  presupuestoSemanal,
  rangoMes,
  rangoSemana,
  rangoSemanaAnterior,
  totalEnRango,
  totalPorCategoria,
  type Gasto,
} from '@/database/gastos';
import { totalFijosMes } from '@/database/fijos';
import { listarMetas } from '@/database/metas';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { categoria, colorCategoria } from '@/utils/categorias';
import { fechaLarga, fromISODate, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

type Periodo = 'semana' | 'mes';
type Datos = {
  total: number;
  anterior: number;
  presupuesto: number;
  totalSemana: number;
  porCategoria: { category: string; total: number }[];
  gastos: Gasto[];
};

export function GastosScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fijosMes, setFijosMes] = useState(0);
  const [ahorrado, setAhorrado] = useState(0);

  const cargar = useCallback(async () => {
    const hoy = new Date();
    const rango = periodo === 'semana' ? rangoSemana(hoy) : rangoMes(hoy);
    const rangoAnt =
      periodo === 'semana'
        ? rangoSemanaAnterior(hoy)
        : rangoMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
    const [total, anterior, presupuesto, totalSemana, porCategoria, gastos] = await Promise.all([
      totalEnRango(db, rango),
      totalEnRango(db, rangoAnt),
      presupuestoSemanal(db),
      totalEnRango(db, rangoSemana(hoy)),
      totalPorCategoria(db, rango),
      gastosEnRango(db, rango),
    ]);
    setDatos({ total, anterior, presupuesto, totalSemana, porCategoria, gastos });
    setFijosMes(await totalFijosMes(db));
    setAhorrado((await listarMetas(db)).reduce((n, m) => n + m.ahorrado, 0));
  }, [db, periodo]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  // Agrupa los gastos por día para la lista.
  const porDia: { fecha: string; total: number; items: Gasto[] }[] = [];
  for (const g of datos?.gastos ?? []) {
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo.fecha === g.date) {
      ultimo.items.push(g);
      ultimo.total += g.amount;
    } else porDia.push({ fecha: g.date, total: g.amount, items: [g] });
  }

  const diferencia = datos ? datos.total - datos.anterior : 0;
  const restante = datos ? datos.presupuesto - datos.totalSemana : 0;
  const ratio = datos && datos.presupuesto > 0 ? datos.totalSemana / datos.presupuesto : 0;
  const hoyISO = toISODate();
  const ayerISO = toISODate(new Date(Date.now() - 86400000));

  return (
    <View style={styles.flex}>
      <Screen eyebrow="Finanzas" title="Gastos">
        <SegmentedControl<Periodo>
          value={periodo}
          onChange={setPeriodo}
          options={[
            { value: 'semana', label: 'Esta semana' },
            { value: 'mes', label: 'Este mes' },
          ]}
        />

        {/* Total grande */}
        <View style={styles.totalBlock}>
          <AppText variant="overline" tone="tertiary">
            {periodo === 'semana' ? 'Gastado esta semana' : 'Gastado este mes'}
          </AppText>
          <AppText variant="display" tabular style={styles.totalNumber} numberOfLines={1} adjustsFontSizeToFit>
            {formatCLP(datos?.total ?? 0)}
          </AppText>
          {datos && datos.anterior > 0 ? (
            <AppText variant="callout" tone={diferencia > 0 ? 'danger' : 'accent'}>
              {diferencia > 0 ? '▲' : '▼'} {formatCLP(Math.abs(diferencia))}{' '}
              <AppText variant="callout" tone="tertiary">
                vs {periodo === 'semana' ? 'la semana pasada' : 'el mes pasado'}
              </AppText>
            </AppText>
          ) : null}
        </View>

        {/* Accesos: gastos fijos y metas de ahorro */}
        <View style={styles.accesos}>
          <Card style={styles.acceso} onPress={() => router.push('/fijos')} accessibilityLabel="Gastos fijos">
            <Ionicons name="repeat-outline" size={20} color={colors.accent} />
            <AppText variant="callout" style={{ marginTop: space.sm }}>Fijos</AppText>
            <AppText variant="caption" tone="tertiary" tabular numberOfLines={1}>
              {formatCLP(fijosMes)}/mes
            </AppText>
          </Card>
          <Card style={styles.acceso} onPress={() => router.push('/metas')} accessibilityLabel="Metas de ahorro">
            <Ionicons name="flag-outline" size={20} color={colors.accent} />
            <AppText variant="callout" style={{ marginTop: space.sm }}>Metas</AppText>
            <AppText variant="caption" tone="tertiary" tabular numberOfLines={1}>
              {formatCLP(ahorrado)} ahorrado
            </AppText>
          </Card>
        </View>

        {/* Presupuesto semanal */}
        {datos && datos.presupuesto > 0 ? (
          <Card style={{ marginTop: space.md }}>
            <View style={styles.rowBetween}>
              <AppText variant="overline" tone="tertiary">Presupuesto semanal</AppText>
              <AppText variant="caption" tone="secondary" tabular>
                {Math.round(ratio * 100)}%
              </AppText>
            </View>
            <View style={{ marginVertical: space.md }}>
              <ProgressBar value={datos.totalSemana} max={datos.presupuesto} />
            </View>
            <AppText variant="callout" tone={ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'secondary'}>
              {ratio >= 1
                ? `Te pasaste por ${formatCLP(-restante)}. Aguanta hasta el lunes 💪`
                : ratio >= 0.8
                  ? `Te quedan ${formatCLP(restante)}. Ojo, que estás cerca del límite.`
                  : `Te quedan ${formatCLP(restante)} de ${formatCLP(datos.presupuesto)}.`}
            </AppText>
          </Card>
        ) : null}

        {/* Por categoría */}
        {datos && datos.porCategoria.length > 0 ? (
          <Card style={{ marginTop: space.md }}>
            <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.lg }}>
              Por categoría
            </AppText>
            <View style={{ gap: space.lg }}>
              {datos.porCategoria.map((c) => {
                const cat = categoria(c.category);
                const pct = datos.total > 0 ? c.total / datos.total : 0;
                return (
                  <View key={c.category} style={{ gap: space.sm }}>
                    <View style={styles.rowBetween}>
                      <View style={styles.catLabel}>
                        <View style={[styles.dot, { backgroundColor: colorCategoria(cat, isDark) }]} />
                        <AppText variant="callout">{cat.label}</AppText>
                      </View>
                      <AppText variant="callout" tabular>
                        {formatCLP(c.total)}
                        <AppText variant="caption" tone="tertiary">  {Math.round(pct * 100)}%</AppText>
                      </AppText>
                    </View>
                    <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
                      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: colorCategoria(cat, isDark) }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        {/* Movimientos */}
        {datos && datos.gastos.length === 0 ? (
          <View style={{ marginTop: space.xxl }}>
            <EmptyState
              icon="wallet-outline"
              title="Sin gastos todavía"
              description="Toca el + para anotar uno. Toma 5 segundos y después agradeces el orden."
            />
          </View>
        ) : (
          porDia.map((d) => (
            <View key={d.fecha} style={{ marginTop: space.xxl }}>
              <View style={[styles.rowBetween, { marginBottom: space.md, marginHorizontal: space.xs }]}>
                <AppText variant="headline">
                  {d.fecha === hoyISO ? 'Hoy' : d.fecha === ayerISO ? 'Ayer' : fechaLarga(fromISODate(d.fecha))}
                </AppText>
                <AppText variant="caption" tone="tertiary" tabular>{formatCLP(d.total)}</AppText>
              </View>
              <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {d.items.map((g, i) => (
                  <Pressable
                    key={g.id}
                    onPress={() => router.push({ pathname: '/gasto', params: { id: String(g.id) } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${categoria(g.category).label} ${formatCLP(g.amount)}`}
                    style={({ pressed }) => [
                      styles.item,
                      i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                      pressed && { backgroundColor: colors.surfaceRaised },
                    ]}
                  >
                    <CategoryIcon cat={g.category} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="callout" numberOfLines={1}>
                        {g.note || categoria(g.category).label}
                      </AppText>
                      {g.note ? (
                        <AppText variant="caption" tone="tertiary">{categoria(g.category).label}</AppText>
                      ) : null}
                    </View>
                    <AppText variant="headline" tabular>{formatCLP(g.amount)}</AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </Screen>
      <Fab accessibilityLabel="Anotar gasto" onPress={() => router.push('/gasto')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  accesos: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  acceso: { flex: 1, padding: space.lg },
  totalBlock: { marginTop: space.xxl, gap: space.xs },
  totalNumber: { fontSize: 44, lineHeight: 52, letterSpacing: -1.6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 64 },
});
