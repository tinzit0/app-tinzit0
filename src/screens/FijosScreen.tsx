/**
 * Gastos fijos: lo que pagas todos los meses (arriendo, celular, Spotify…).
 * Se suman solos como gasto el día de pago y te aviso un día antes.
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { CategoryIcon } from '@/components/CategoryIcon';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { PressableScale } from '@/components/PressableScale';
import { diaDePagoEn, listarFijos, totalFijosMes, type GastoFijo } from '@/database/fijos';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { formatCLP } from '@/utils/moneda';

export function FijosScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const [fijos, setFijos] = useState<GastoFijo[]>([]);
  const [total, setTotal] = useState(0);
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setFijos(await listarFijos(db));
        setTotal(await totalFijosMes(db));
        setCargado(true);
      })().catch(console.warn);
    }, [db]),
  );

  const hoy = new Date();
  const proximo = (f: GastoFijo) => {
    const dia = diaDePagoEn(f, hoy.getFullYear(), hoy.getMonth());
    const faltan = dia - hoy.getDate();
    if (faltan === 0) return 'Se paga hoy';
    if (faltan === 1) return 'Mañana';
    if (faltan > 1) return `En ${faltan} días · día ${f.day_of_month}`;
    return `Pagado · día ${f.day_of_month}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Gastos fijos' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <AppText variant="overline" tone="tertiary">Total mensual</AppText>
        <AppText variant="display" tabular style={{ marginTop: space.xs, marginBottom: space.xxl }}>
          {formatCLP(total)}
        </AppText>

        {cargado && fijos.length === 0 ? (
          <EmptyState
            icon="repeat-outline"
            title="Sin gastos fijos"
            description="Agrega lo que pagas cada mes. Se suma solo el día de pago y te aviso el día antes."
          />
        ) : (
          <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {fijos.map((f, i) => (
              <PressableScale
                key={f.id}
                pressedScale={0.99}
                onPress={() => router.push({ pathname: '/fijo', params: { id: String(f.id) } })}
                accessibilityRole="button"
                accessibilityLabel={`${f.name}, ${formatCLP(f.amount)}`}
                style={[
                  styles.item,
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  !f.active && { opacity: 0.45 },
                ]}
              >
                <CategoryIcon cat={f.category} />
                <View style={{ flex: 1 }}>
                  <AppText variant="callout" numberOfLines={1}>{f.name}</AppText>
                  <AppText variant="caption" tone="tertiary">{f.active ? proximo(f) : 'Pausado'}</AppText>
                </View>
                <AppText variant="headline" tabular>{formatCLP(f.amount)}</AppText>
              </PressableScale>
            ))}
          </View>
        )}
      </ScrollView>
      <Fab accessibilityLabel="Nuevo gasto fijo" onPress={() => router.push('/fijo')} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 3 },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 64 },
});
