/**
 * Gastos posiblemente repetidos: mismo monto con 1 día o menos de diferencia
 * (típico: el aviso del banco + la boleta escaneada + anotado a mano).
 * Para cada par: borrar uno de los dos, o "No es repetido" (no se vuelve a mostrar).
 */
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { eliminarGasto } from '@/database/gastos';
import { marcarNoDuplicado, posiblesDuplicados } from '@/database/presupuestos';
import type { GastoSimple, ParDuplicado } from '@/finanzas/duplicados';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { categoria } from '@/utils/categorias';
import { fechaCorta, fromISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

export function DuplicadosScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [pares, setPares] = useState<ParDuplicado[] | null>(null);
  const [error, setError] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(() => {
    let vivo = true;
    posiblesDuplicados(db)
      .then((p) => {
        if (!vivo) return;
        setPares(p);
        setError(false);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [db]);
  useFocusEffect(cargar);

  const clave = (p: ParDuplicado) => `${p.a.id}-${p.b.id}`;

  const borrar = (p: ParDuplicado, g: GastoSimple) => {
    Alert.alert('¿Borrar este gasto?', `${formatCLP(g.amount)} · ${g.note ?? categoria(g.category).label}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          setOcupado(clave(p));
          try {
            await eliminarGasto(db, g.id);
            setPares((ps) => ps?.filter((x) => x !== p) ?? null);
          } catch {
            Alert.alert('No se pudo borrar', 'Inténtalo de nuevo.');
          } finally {
            setOcupado(null);
          }
        },
      },
    ]);
  };

  const noEs = async (p: ParDuplicado) => {
    setOcupado(clave(p));
    try {
      await marcarNoDuplicado(db, p.a.id, p.b.id);
      setPares((ps) => ps?.filter((x) => x !== p) ?? null);
    } catch {
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    } finally {
      setOcupado(null);
    }
  };

  const Gasto = ({ p, g }: { p: ParDuplicado; g: GastoSimple }) => (
    <View style={styles.gasto}>
      <View style={{ flex: 1 }}>
        <AppText variant="callout" numberOfLines={1}>{g.note || categoria(g.category).label}</AppText>
        <AppText variant="caption" tone="tertiary">
          {fechaCorta(fromISODate(g.date))} · {categoria(g.category).label}
        </AppText>
      </View>
      <Button label="Borrar" variant="danger" onPress={() => borrar(p, g)} disabled={ocupado === clave(p)} style={{ minHeight: 40 }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Gastos repetidos' }} />
      <FlatList
        data={pares ?? []}
        keyExtractor={clave}
        contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxxl, gap: space.md }}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <AppText variant="callout" tone="secondary">
              Estos gastos tienen el mismo monto y fechas muy cercanas. Si es el mismo gasto anotado dos veces, borra uno.
            </AppText>
            {error ? (
              <Card style={{ gap: space.sm }}>
                <AppText variant="callout">No pude revisar tus gastos.</AppText>
                <Button label="Reintentar" variant="secondary" onPress={cargar} />
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          pares ? <EmptyState icon="checkmark-circle-outline" title="Nada repetido" description="No encontré gastos anotados dos veces en las últimas semanas." /> : undefined
        }
        renderItem={({ item: p }) => (
          <Card style={{ gap: space.sm }}>
            <AppText variant="headline" tabular>{formatCLP(p.a.amount)}</AppText>
            <Gasto p={p} g={p.a} />
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            <Gasto p={p} g={p.b} />
            <Button label="No es repetido" variant="secondary" onPress={() => noEs(p)} disabled={ocupado === clave(p)} />
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gasto: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
