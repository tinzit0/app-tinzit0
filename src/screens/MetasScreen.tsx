/**
 * Metas de ahorro: cada una con su barra de progreso.
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { ProgressBar } from '@/components/ProgressBar';
import { ahorroSemanalNecesario, listarMetas, type Meta } from '@/database/metas';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaCorta, fromISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

export function MetasScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listarMetas(db)
        .then((m) => {
          setMetas(m);
          setCargado(true);
        })
        .catch(console.warn);
    }, [db]),
  );

  const totalAhorrado = metas.reduce((n, m) => n + m.ahorrado, 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Metas de ahorro' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <AppText variant="overline" tone="tertiary">Ahorrado en total</AppText>
        <AppText variant="display" tabular style={{ marginTop: space.xs, marginBottom: space.xxl }}>
          {formatCLP(totalAhorrado)}
        </AppText>

        {cargado && metas.length === 0 ? (
          <EmptyState
            icon="flag-outline"
            title="Ponte una meta"
            description="Un viaje, un celular nuevo, un fondo de emergencia… Toca el + y anda abonando de a poco."
          />
        ) : (
          <View style={{ gap: space.md }}>
            {metas.map((m) => {
              const pct = m.target > 0 ? Math.min(1, m.ahorrado / m.target) : 0;
              const semanal = ahorroSemanalNecesario(m);
              const lista = m.ahorrado >= m.target;
              return (
                <Card
                  key={m.id}
                  onPress={() => router.push({ pathname: '/meta', params: { id: String(m.id) } })}
                  accessibilityLabel={`Meta ${m.name}, ${Math.round(pct * 100)} por ciento`}
                >
                  <View style={styles.row}>
                    <AppText variant="headline" numberOfLines={1} style={{ flex: 1 }}>
                      {lista ? '🎉 ' : ''}{m.name}
                    </AppText>
                    <AppText variant="callout" tone={lista ? 'accent' : 'secondary'} tabular>
                      {Math.round(pct * 100)}%
                    </AppText>
                  </View>
                  <View style={{ marginVertical: space.md }}>
                    <ProgressBar value={m.ahorrado} max={m.target} />
                  </View>
                  <View style={styles.row}>
                    <AppText variant="caption" tone="secondary" tabular>
                      {formatCLP(m.ahorrado)} de {formatCLP(m.target)}
                    </AppText>
                    <AppText variant="caption" tone="tertiary">
                      {lista
                        ? '¡Lograda!'
                        : semanal
                          ? `${formatCLP(semanal)}/semana`
                          : m.deadline
                            ? `Vencía el ${fechaCorta(fromISODate(m.deadline))}`
                            : 'Sin fecha'}
                    </AppText>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
      <Fab accessibilityLabel="Nueva meta" onPress={() => router.push('/meta-form')} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
});
