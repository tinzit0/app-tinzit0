/**
 * Peso corporal y medidas: últimos valores, gráfico de evolución e historial.
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { LineChart } from '@/components/LineChart';
import { eliminarMedicion, listarMediciones, MEDIDAS, type Medicion, type Medida } from '@/database/cuerpo';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaCorta, fechaLarga, fromISODate } from '@/utils/fechas';

export function CuerpoScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [datos, setDatos] = useState<Medicion[]>([]);
  const [medida, setMedida] = useState<Medida>('weight');
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    setDatos(await listarMediciones(db));
    setCargado(true);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const info = MEDIDAS.find((m) => m.key === medida)!;
  const serie = datos.filter((d) => d[medida] != null);
  const primero = serie[0]?.[medida] ?? null;
  const ultimo = serie[serie.length - 1]?.[medida] ?? null;
  const cambio = primero != null && ultimo != null ? Math.round((ultimo - primero) * 10) / 10 : null;

  const borrar = (m: Medicion) =>
    Alert.alert('¿Borrar medición?', fechaLarga(fromISODate(m.date)), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await eliminarMedicion(db, m.id);
          await cargar();
        },
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Cuerpo' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {cargado && datos.length === 0 ? (
          <EmptyState
            icon="body-outline"
            title="Registra tu peso y medidas"
            description="Una vez a la semana basta. Con el tiempo vas a ver tu evolución en el gráfico."
          />
        ) : (
          <>
            <View style={styles.chips}>
              {MEDIDAS.map((m) => (
                <Chip key={m.key} label={m.label} compact selected={medida === m.key} onPress={() => setMedida(m.key)} />
              ))}
            </View>

            <View style={styles.hero}>
              <AppText variant="display" tabular style={{ fontSize: 44, lineHeight: 52 }}>
                {ultimo != null ? `${ultimo}` : '—'}
                <AppText variant="title" tone="tertiary"> {info.unidad}</AppText>
              </AppText>
              {cambio != null && serie.length > 1 ? (
                <AppText variant="callout" tone="secondary">
                  {cambio > 0 ? '▲' : cambio < 0 ? '▼' : '='} {Math.abs(cambio)} {info.unidad} desde el{' '}
                  {fechaCorta(fromISODate(serie[0].date))}
                </AppText>
              ) : null}
            </View>

            <Card>
              {serie.length > 0 ? (
                <LineChart
                  data={serie.slice(-24).map((d) => ({ label: fechaCorta(fromISODate(d.date)), value: d[medida]! }))}
                  format={(v) => `${Math.round(v * 10) / 10} ${info.unidad}`}
                />
              ) : (
                <AppText variant="callout" tone="tertiary">Aún no registras {info.label.toLowerCase()}.</AppText>
              )}
            </Card>

            <AppText variant="headline" style={styles.h}>Historial</AppText>
            <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {[...datos].reverse().map((d, i) => (
                <Pressable
                  key={d.id}
                  onLongPress={() => borrar(d)}
                  onPress={() => router.push({ pathname: '/medicion', params: { fecha: d.date } })}
                  accessibilityHint="Toca para editar, mantén presionado para borrar"
                  style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <AppText variant="callout">{fechaLarga(fromISODate(d.date))}</AppText>
                  <AppText variant="caption" tone="secondary" tabular>
                    {MEDIDAS.filter((m) => d[m.key] != null)
                      .map((m) => `${m.label} ${d[m.key]} ${m.unidad}`)
                      .join(' · ')}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <Fab accessibilityLabel="Nueva medición" onPress={() => router.push('/medicion')} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hero: { marginVertical: space.xl, gap: space.xs },
  h: { marginTop: space.xxl, marginBottom: space.md, marginLeft: space.xs },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  item: { padding: space.lg, gap: 2 },
});
