/**
 * Progreso de un ejercicio: gráfico del peso máximo por sesión + historial.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { LineChart } from '@/components/LineChart';
import {
  eliminarEjercicio,
  historialEjercicio,
  obtenerEjercicio,
  resumirSeries,
  type Ejercicio,
  type Sesion,
} from '@/database/gym';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaCorta, fechaLarga, fromISODate } from '@/utils/fechas';

export function EjercicioScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ej, setEj] = useState<Ejercicio | null>(null);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);

  useEffect(() => {
    const n = Number(id);
    obtenerEjercicio(db, n).then(setEj);
    historialEjercicio(db, n).then(setSesiones);
  }, [db, id]);

  const primera = sesiones[0];
  const ultima = sesiones[sesiones.length - 1];
  const mejora = primera && ultima ? ultima.maxPeso - primera.maxPeso : 0;
  const record = sesiones.reduce((m, s) => Math.max(m, s.maxPeso), 0);

  const borrar = () => {
    Alert.alert('¿Eliminar ejercicio?', 'Se borra también todo su historial.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarEjercicio(db, Number(id));
          if (router.canGoBack()) router.back();
          else router.replace('/gym');
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: ej?.name ?? 'Ejercicio' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <View style={styles.stats}>
          <Stat label="Récord" value={`${record} kg`} />
          <Stat label="Sesiones" value={String(sesiones.length)} />
          <Stat
            label="Progreso"
            value={`${mejora > 0 ? '+' : ''}${mejora} kg`}
            tone={mejora > 0 ? 'accent' : 'primary'}
          />
        </View>

        <Card style={{ marginTop: space.md }}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>
            Peso máximo por sesión
          </AppText>
          {sesiones.length > 0 ? (
            <LineChart
              data={sesiones.slice(-20).map((s) => ({ label: fechaCorta(fromISODate(s.date)), value: s.maxPeso }))}
              format={(v) => `${v} kg`}
            />
          ) : (
            <AppText variant="callout" tone="tertiary">Sin datos todavía.</AppText>
          )}
        </Card>

        <AppText variant="headline" style={styles.h}>Historial</AppText>
        <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[...sesiones].reverse().map((s, i) => (
            <View key={s.date} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <AppText variant="callout">{fechaLarga(fromISODate(s.date))}</AppText>
              <AppText variant="caption" tone="secondary" tabular>{resumirSeries(s.sets)}</AppText>
            </View>
          ))}
        </View>

        <Button label="Eliminar ejercicio" variant="danger" onPress={borrar} style={{ marginTop: space.xxxl }} />
      </ScrollView>
    </>
  );
}

function Stat({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'accent' }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="overline" tone="tertiary">{label}</AppText>
      <AppText variant="title" tone={tone} tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: space.xs },
  h: { marginTop: space.xxl, marginBottom: space.md, marginLeft: space.xs },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  item: { padding: space.lg, gap: 2 },
});
