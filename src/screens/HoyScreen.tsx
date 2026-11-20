/**
 * Pantalla "Hoy": lo primero que ves al abrir la app.
 * Saludo según la hora, tareas del día, si toca gym y el gasto de la semana.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { IconButton } from '@/components/IconButton';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { getResumenHoy, type ResumenHoy } from '@/database/queries';
import { necesitaRespaldo } from '@/database/respaldo';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaLarga, saludo } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

export function HoyScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [data, setData] = useState<ResumenHoy | null>(null);
  const [pedirRespaldo, setPedirRespaldo] = useState(false);

  // Cada vez que vuelves a esta pestaña, recargamos los datos.
  useFocusEffect(
    useCallback(() => {
      getResumenHoy(db).then(setData).catch(console.warn);
      necesitaRespaldo(db).then(setPedirRespaldo).catch(() => {});
    }, [db]),
  );

  const ahora = new Date();
  const titulo = data?.nombre ? `${saludo(ahora)},\n${data.nombre}` : saludo(ahora);
  const totalTareas = (data?.tareasPendientes ?? 0) + (data?.tareasHechas ?? 0);

  return (
    <Screen
      eyebrow={fechaLarga(ahora)}
      title={titulo}
      right={
        <IconButton icon="settings-outline" accessibilityLabel="Abrir ajustes" onPress={() => router.push('/ajustes')} />
      }
    >
      {/* Recordatorio semanal de respaldo */}
      {pedirRespaldo ? (
        <Card
          onPress={() => router.push('/ajustes')}
          accessibilityLabel="Hacer respaldo"
          style={[styles.banner, { backgroundColor: colors.warningSoft, borderColor: 'transparent' }]}
        >
          <Ionicons name="cloud-upload-outline" size={20} color={colors.warning} />
          <AppText variant="callout" style={{ flex: 1 }}>
            Hace rato que no respaldas tus datos. Tócame y lo hacemos en 10 segundos.
          </AppText>
        </Card>
      ) : null}

      {/* Tareas de hoy: la tarjeta principal */}
      <Card onPress={() => router.navigate('/tareas')} accessibilityLabel="Ver tareas de hoy">
        <View style={styles.cardTop}>
          <AppText variant="overline" tone="tertiary">Tareas de hoy</AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
        <View style={styles.bigRow}>
          <AppText variant="display" tabular>{data?.tareasPendientes ?? 0}</AppText>
          <AppText variant="callout" tone="secondary" style={styles.bigSuffix}>
            {totalTareas === 0 ? 'nada pendiente' : `pendientes de ${totalTareas}`}
          </AppText>
        </View>
        <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>
          {totalTareas === 0
            ? 'Agrega tu primera tarea en la pestaña Tareas.'
            : data?.tareasPendientes === 0
              ? 'Todo listo por hoy. Bien ahí 🙌'
              : 'Vamos de a una, que se puede.'}
        </AppText>
      </Card>

      {/* Fila de dos tarjetas: Gym y Gastos */}
      <View style={styles.row}>
        <Card style={styles.half} onPress={() => router.navigate('/gym')} accessibilityLabel="Ver gym">
          <AppText variant="overline" tone="tertiary">Gym</AppText>
          <AppText variant="title" style={{ marginTop: space.md }} numberOfLines={1}>
            {data?.gymHoy ?? 'Descanso'}
          </AppText>
          <AppText variant="caption" tone="secondary" style={{ marginTop: space.xs }}>
            {data?.gymHoy ? 'Te toca hoy' : 'Recupera energía'}
          </AppText>
        </Card>

        <Card style={styles.half} onPress={() => router.navigate('/gastos')} accessibilityLabel="Ver gastos">
          <AppText variant="overline" tone="tertiary">Semana</AppText>
          <AppText variant="title" tabular style={{ marginTop: space.md }} numberOfLines={1} adjustsFontSizeToFit>
            {formatCLP(data?.gastoSemana ?? 0)}
          </AppText>
          <View style={{ marginTop: space.md }}>
            <ProgressBar value={data?.gastoSemana ?? 0} max={data?.presupuestoSemana ?? 0} />
          </View>
          <AppText variant="caption" tone="secondary" style={{ marginTop: space.sm }} numberOfLines={1}>
            de {formatCLP(data?.presupuestoSemana ?? 0)}
          </AppText>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space.md, gap: space.sm },
  bigSuffix: { flexShrink: 1 },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  half: { flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, marginBottom: space.md },
});
