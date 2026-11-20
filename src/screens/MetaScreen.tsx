/**
 * Detalle de una meta: progreso, botones rápidos para abonar e historial de abonos.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { MontoInput } from '@/components/MontoInput';
import { ProgressBar } from '@/components/ProgressBar';
import {
  abonar,
  abonosDeMeta,
  ahorroSemanalNecesario,
  eliminarAbono,
  obtenerMeta,
  type Meta,
} from '@/database/metas';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaLarga, fromISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

const RAPIDOS = [5000, 10000, 20000, 50000];

export function MetaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [abonos, setAbonos] = useState<{ id: number; amount: number; date: string }[]>([]);
  const [otro, setOtro] = useState(0);

  const cargar = useCallback(async () => {
    setMeta(await obtenerMeta(db, Number(id)));
    setAbonos(await abonosDeMeta(db, Number(id)));
  }, [db, id]);

  useEffect(() => {
    cargar().catch(console.warn);
  }, [cargar]);

  const agregar = async (monto: number) => {
    if (!meta || monto === 0) return;
    const antes = meta.ahorrado;
    await abonar(db, meta.id, monto);
    setOtro(0);
    await cargar();
    if (antes < meta.target && antes + monto >= meta.target) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('¡Meta lograda! 🎉', `Juntaste ${formatCLP(meta.target)} para "${meta.name}". Qué orgullo.`);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const borrarAbono = (a: { id: number; amount: number }) =>
    Alert.alert('¿Borrar este abono?', formatCLP(a.amount), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await eliminarAbono(db, a.id);
          await cargar();
        },
      },
    ]);

  if (!meta) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const pct = meta.target > 0 ? Math.min(1, meta.ahorrado / meta.target) : 0;
  const semanal = ahorroSemanalNecesario(meta);

  return (
    <>
      <Stack.Screen
        options={{
          title: meta.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/meta-form', params: { id: String(meta.id) } })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Editar meta"
            >
              <Ionicons name="create-outline" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="display" tabular style={{ fontSize: 44, lineHeight: 52 }}>{formatCLP(meta.ahorrado)}</AppText>
        <AppText variant="callout" tone="secondary" tabular>
          de {formatCLP(meta.target)} · {Math.round(pct * 100)}%
        </AppText>
        <View style={{ marginTop: space.lg }}>
          <ProgressBar value={meta.ahorrado} max={meta.target} />
        </View>
        {meta.deadline ? (
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
            Fecha límite: {fechaLarga(fromISODate(meta.deadline))}
            {semanal ? ` · ahorra ${formatCLP(semanal)} a la semana para llegar` : ''}
          </AppText>
        ) : null}

        <Card style={{ marginTop: space.xxl }}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Abonar</AppText>
          <View style={styles.chips}>
            {RAPIDOS.map((m) => (
              <Chip key={m} label={`+${formatCLP(m)}`} onPress={() => agregar(m)} />
            ))}
          </View>
          <View style={[styles.otro, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
            <MontoInput value={otro} onChange={setOtro} size={24} placeholder="Otro monto" accessibilityLabel="Otro monto a abonar" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} />
            <Button label="Abonar" onPress={() => agregar(otro)} disabled={otro <= 0} style={{ minHeight: 44, flexShrink: 0, paddingHorizontal: space.lg }} />
          </View>
          {meta.ahorrado > 0 ? (
            <Pressable
              onPress={() => otro > 0 && agregar(-Math.min(otro, meta.ahorrado))}
              disabled={otro <= 0}
              style={{ marginTop: space.md, opacity: otro > 0 ? 1 : 0.4 }}
              accessibilityRole="button"
            >
              <AppText variant="caption" tone="danger">Retirar ese monto de la meta</AppText>
            </Pressable>
          ) : null}
        </Card>

        <AppText variant="headline" style={styles.h}>Abonos</AppText>
        {abonos.length === 0 ? (
          <AppText variant="callout" tone="tertiary" style={{ marginLeft: space.xs }}>Todavía nada. El primer paso es el más importante.</AppText>
        ) : (
          <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {abonos.map((a, i) => (
              <Pressable
                key={a.id}
                onLongPress={() => borrarAbono(a)}
                accessibilityHint="Mantén presionado para borrar"
                style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
              >
                <AppText variant="callout" style={{ flex: 1 }}>{fechaLarga(fromISODate(a.date))}</AppText>
                <AppText variant="headline" tone={a.amount < 0 ? 'danger' : 'accent'} tabular>
                  {a.amount > 0 ? '+' : ''}{formatCLP(a.amount)}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}
        {abonos.length > 0 ? (
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm, marginLeft: space.xs }}>
            Mantén presionado un abono para borrarlo.
          </AppText>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  otro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingLeft: space.md,
    padding: 4,
  },
  h: { marginTop: space.xxl, marginBottom: space.md, marginLeft: space.xs },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', padding: space.lg, minHeight: 56 },
});
