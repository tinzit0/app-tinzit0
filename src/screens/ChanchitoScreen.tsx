/**
 * Chanchito: alcancía aparte de las metas. Echas la plata que vas ahorrando (botones rápidos
 * o un monto) y el chanchito se va llenando. Meta opcional. Puedes sacar si lo necesitas, sin culpa.
 */
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chanchito } from '@/components/Chanchito';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { MontoInput } from '@/components/MontoInput';
import { PressableScale } from '@/components/PressableScale';
import { ProgressBar } from '@/components/ProgressBar';
import {
  echadoEnMes,
  echarAlChanchito,
  eliminarMovimiento,
  metaChanchito,
  movimientosChanchito,
  ponerMetaChanchito,
  sacarDelChanchito,
  totalChanchito,
  type Movimiento,
} from '@/database/chanchito';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaCorta, fromISODate, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

const RAPIDOS = [1000, 2000, 5000, 10000];

export function ChanchitoScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState(0);
  const [mes, setMes] = useState(0);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [monto, setMonto] = useState(0);
  const [nota, setNota] = useState('');
  const [monedas, setMonedas] = useState(0);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaNueva, setMetaNueva] = useState(0);

  const cargar = useCallback(async () => {
    const [t, m, e, l] = await Promise.all([totalChanchito(db), metaChanchito(db), echadoEnMes(db), movimientosChanchito(db)]);
    setTotal(t);
    setMeta(m);
    setMes(e);
    setMovs(l);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const echar = async (cuanto: number, conNota = false) => {
    if (!(cuanto > 0)) return;
    try {
      await echarAlChanchito(db, cuanto, conNota ? nota : null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMonedas((n) => n + 1);
      if (conNota) {
        setMonto(0);
        setNota('');
      }
      await cargar();
    } catch (e) {
      console.warn(e);
      Alert.alert('No se pudo guardar', 'Inténtalo de nuevo.');
    }
  };

  const sacar = () => {
    if (!(monto > 0)) return;
    Alert.alert('¿Sacar del chanchito?', `${formatCLP(Math.min(monto, total))}. A veces se necesita, y está bien.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sacar',
        onPress: async () => {
          const sacado = await sacarDelChanchito(db, monto, nota);
          if (sacado > 0) Haptics.selectionAsync().catch(() => {});
          setMonto(0);
          setNota('');
          await cargar();
        },
      },
    ]);
  };

  const guardarMeta = async () => {
    await ponerMetaChanchito(db, metaNueva);
    setEditandoMeta(false);
    await cargar();
  };

  const borrarMov = (m: Movimiento) =>
    Alert.alert('¿Borrar este movimiento?', `${m.amount > 0 ? 'Echaste' : 'Sacaste'} ${formatCLP(Math.abs(m.amount))} el ${fechaCorta(fromISODate(m.date))}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await eliminarMovimiento(db, m.id);
          await cargar();
        },
      },
    ]);

  const lleno = meta > 0 ? total / meta : total > 0 ? 0.35 : 0;
  const pct = meta > 0 ? Math.min(100, Math.round((total / meta) * 100)) : null;

  return (
    <>
      <Stack.Screen options={{ title: 'Chanchito' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <Chanchito lleno={lleno} monedas={monedas} />
          <AppText variant="overline" tone="tertiary" style={{ marginTop: space.md }}>Llevas ahorrado</AppText>
          <AppText variant="display" tabular accessibilityLiveRegion="polite">{formatCLP(total)}</AppText>
          {mes > 0 ? (
            <AppText variant="caption" tone="accent" style={{ marginTop: space.xs }}>+{formatCLP(mes)} este mes 🐷</AppText>
          ) : (
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs }}>Cada moneda cuenta, aunque sea poquito.</AppText>
          )}
        </View>

        {/* Meta */}
        <Card style={{ marginTop: space.xl }}>
          {editandoMeta ? (
            <>
              <FieldLabel>Meta del chanchito</FieldLabel>
              <MontoInput value={metaNueva} onChange={setMetaNueva} size={32} autoFocus accessibilityLabel="Meta del chanchito" />
              <View style={[styles.fila, { marginTop: space.md }]}>
                <Button label="Guardar" onPress={guardarMeta} style={{ flex: 1 }} />
                <Button label="Cancelar" variant="secondary" onPress={() => setEditandoMeta(false)} style={{ flex: 1 }} />
              </View>
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>Déjala en $0 si prefieres ahorrar sin meta.</AppText>
            </>
          ) : meta > 0 ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Meta ${formatCLP(meta)}, llevas ${pct}%. Tocar para cambiarla`}
              onPress={() => {
                setMetaNueva(meta);
                setEditandoMeta(true);
              }}
            >
              <View style={styles.entre}>
                <AppText variant="callout">Meta: {formatCLP(meta)}</AppText>
                <AppText variant="callout" tone="accent" tabular>{pct}%</AppText>
              </View>
              <View style={{ marginTop: space.sm }}>
                <ProgressBar value={Math.min(total, meta)} max={meta * 1.25} />
              </View>
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
                {total >= meta ? '¡Llenaste el chanchito! 🎉' : `Te faltan ${formatCLP(meta - total)}. Vas bien.`}
              </AppText>
            </PressableScale>
          ) : (
            <PressableScale
              accessibilityRole="button"
              onPress={() => {
                setMetaNueva(0);
                setEditandoMeta(true);
              }}
            >
              <AppText variant="callout">Ponle una meta (opcional)</AppText>
              <AppText variant="caption" tone="tertiary">Así ves cuánto se va llenando.</AppText>
            </PressableScale>
          )}
        </Card>

        {/* Echar rápido */}
        <View style={{ marginTop: space.xxl }}>
          <FieldLabel>Echar al tiro</FieldLabel>
          <View style={styles.wrap}>
            {RAPIDOS.map((r) => (
              <Chip key={r} label={`+${formatCLP(r)}`} onPress={() => echar(r)} accessibilityLabel={`Echar ${formatCLP(r)} al chanchito`} />
            ))}
          </View>
        </View>

        {/* Otro monto */}
        <View style={{ marginTop: space.xxl }}>
          <FieldLabel>Otro monto</FieldLabel>
          <MontoInput value={monto} onChange={setMonto} size={36} accessibilityLabel="Monto para el chanchito" />
          <View style={{ marginTop: space.md }}>
            <Field value={nota} onChangeText={setNota} placeholder="Nota (opcional): vuelto, mesada…" maxLength={60} />
          </View>
          <View style={[styles.fila, { marginTop: space.md }]}>
            <Button label="Echar" onPress={() => echar(monto, true)} disabled={!(monto > 0)} style={{ flex: 1 }} />
            <Button label="Sacar" variant="secondary" onPress={sacar} disabled={!(monto > 0) || total <= 0} style={{ flex: 1 }} />
          </View>
        </View>

        {/* Historial */}
        {movs.length ? (
          <View style={{ marginTop: space.xxl }}>
            <FieldLabel>Movimientos</FieldLabel>
            <Card style={{ paddingVertical: space.xs }}>
              {movs.map((m, k) => (
                <PressableScale
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.amount > 0 ? 'Echaste' : 'Sacaste'} ${formatCLP(Math.abs(m.amount))}${m.note ? `, ${m.note}` : ''}. Mantén presionado para borrar`}
                  onLongPress={() => borrarMov(m)}
                  style={[styles.mov, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="callout" numberOfLines={1}>{m.note ?? (m.amount > 0 ? 'Al chanchito' : 'Saqué')}</AppText>
                    <AppText variant="caption" tone="tertiary">{m.date === toISODate() ? 'Hoy' : fechaCorta(fromISODate(m.date))}</AppText>
                  </View>
                  <AppText variant="headline" tabular tone={m.amount > 0 ? 'accent' : 'secondary'}>
                    {m.amount > 0 ? '+' : '−'}{formatCLP(Math.abs(m.amount))}
                  </AppText>
                </PressableScale>
              ))}
            </Card>
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>Mantén presionado un movimiento para borrarlo.</AppText>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', gap: space.md },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mov: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});
