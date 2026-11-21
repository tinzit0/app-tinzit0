/**
 * Presupuestos por categoría: un límite mensual para cada categoría (comida, transporte…)
 * con su avance del mes, y exportar tus gastos a CSV (Excel / Google Sheets).
 */
import { File, Paths } from 'expo-file-system';
import { Stack, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Chip } from '@/components/Chip';
import { MontoInput } from '@/components/MontoInput';
import { ProgressBar } from '@/components/ProgressBar';
import { avancePorCategoria, gastosDelRango, guardarPresupuesto, type AvanceCategoria } from '@/database/presupuestos';
import { gastosACSV } from '@/finanzas/duplicados';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { CATEGORIAS, categoria } from '@/utils/categorias';
import { toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

const RANGOS = [
  { id: 'mes', label: 'Este mes' },
  { id: '3m', label: '3 meses' },
  { id: 'anio', label: 'Este año' },
] as const;

export function PresupuestosScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [avance, setAvance] = useState<AvanceCategoria[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [monto, setMonto] = useState(0);
  const [error, setError] = useState(false);
  const [rango, setRango] = useState<(typeof RANGOS)[number]['id']>('mes');
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(() => {
    let vivo = true;
    avancePorCategoria(db)
      .then((a) => {
        if (!vivo) return;
        setAvance(a);
        setError(false);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [db]);
  useFocusEffect(cargar);

  const de = (key: string) => avance.find((a) => a.category === key) ?? { category: key, limite: 0, gastado: 0 };

  const guardar = async (key: string) => {
    try {
      await guardarPresupuesto(db, key, monto);
      setEditando(null);
      cargar();
    } catch {
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const hoy = new Date();
      const desde =
        rango === 'mes'
          ? toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
          : rango === '3m'
            ? toISODate(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1))
            : toISODate(new Date(hoy.getFullYear(), 0, 1));
      const gastos = await gastosDelRango(db, desde, toISODate(hoy));
      if (!gastos.length) {
        Alert.alert('Sin gastos', 'No hay gastos en ese período.');
        return;
      }
      const csv = gastosACSV(gastos, (c) => categoria(c).label);
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        Alert.alert('No disponible', 'Exportar funciona en la app instalada.');
        return;
      }
      const archivo = new File(Paths.cache, `tinzit0-gastos-${desde}-a-${toISODate(hoy)}.csv`);
      if (archivo.exists) archivo.delete();
      await archivo.write(csv);
      await Sharing.shareAsync(archivo.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar gastos (CSV)' });
    } catch (e) {
      Alert.alert('No se pudo exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Presupuestos' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="callout" tone="secondary">
          Ponle un límite al mes a cada categoría. Te muestro cuánto llevas. (El presupuesto semanal general sigue en Ajustes.)
        </AppText>
        {error ? (
          <Card style={{ marginTop: space.lg, gap: space.sm }}>
            <AppText variant="callout">No pude cargar tus presupuestos.</AppText>
            <Button label="Reintentar" variant="secondary" onPress={cargar} />
          </Card>
        ) : null}

        <View style={{ gap: space.sm, marginTop: space.xl }}>
          {CATEGORIAS.map((c) => {
            const a = de(c.key);
            const pasado = a.limite > 0 && a.gastado > a.limite;
            return (
              <Card key={c.key} style={{ gap: space.sm }}>
                <View style={styles.fila}>
                  <CategoryIcon cat={c.key} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="callout">{c.label}</AppText>
                    <AppText variant="caption" tone={pasado ? 'danger' : 'tertiary'} tabular>
                      {a.limite > 0
                        ? `${formatCLP(a.gastado)} de ${formatCLP(a.limite)}${pasado ? ' · te pasaste' : ''}`
                        : a.gastado > 0
                          ? `${formatCLP(a.gastado)} este mes · sin límite`
                          : 'Sin límite'}
                    </AppText>
                  </View>
                  <Chip
                    compact
                    label={a.limite > 0 ? 'Cambiar' : 'Poner límite'}
                    selected={editando === c.key}
                    onPress={() => {
                      setEditando(editando === c.key ? null : c.key);
                      setMonto(a.limite);
                    }}
                  />
                </View>
                {a.limite > 0 ? <ProgressBar value={a.gastado} max={a.limite} /> : null}
                {editando === c.key ? (
                  <View style={{ gap: space.sm }}>
                    <MontoInput value={monto} onChange={setMonto} size={28} autoFocus accessibilityLabel={`Límite mensual de ${c.label}`} />
                    <View style={styles.fila}>
                      <Button label="Guardar" onPress={() => guardar(c.key)} style={{ flex: 1 }} />
                      {a.limite > 0 ? (
                        <Button
                          label="Quitar"
                          variant="secondary"
                          onPress={() => {
                            setMonto(0);
                            guardarPresupuesto(db, c.key, 0)
                              .then(() => {
                                setEditando(null);
                                cargar();
                              })
                              .catch(() => Alert.alert('No se pudo quitar', 'Inténtalo de nuevo.'));
                          }}
                          style={{ flex: 1 }}
                        />
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>

        <AppText variant="overline" tone="tertiary" style={{ marginTop: space.xxl, marginBottom: space.md }}>Exportar a Excel (CSV)</AppText>
        <View style={styles.wrap}>
          {RANGOS.map((r) => (
            <Chip key={r.id} compact label={r.label} selected={rango === r.id} onPress={() => setRango(r.id)} />
          ))}
        </View>
        <Button label="Exportar gastos" variant="secondary" onPress={exportar} loading={exportando} style={{ marginTop: space.md }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
