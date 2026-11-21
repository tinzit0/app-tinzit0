/**
 * Repaso de tarjetas: ves la pregunta, piensas la respuesta, la das vuelta y dices
 * qué tan bien te la sabías. Según eso, la tarjeta vuelve en minutos, días o semanas.
 */
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { guardarRepaso, tarjetasParaHoy, type Tarjeta } from '@/database/estudio';
import { textoIntervalo, type Calidad } from '@/estudio/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const BOTONES: { calidad: Calidad; label: string }[] = [
  { calidad: 0, label: 'Otra vez' },
  { calidad: 1, label: 'Difícil' },
  { calidad: 2, label: 'Bien' },
  { calidad: 3, label: 'Fácil' },
];

export function RepasoScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ ramo?: string }>();
  const filtro = params.ramo === 'sin' ? null : params.ramo ? Number(params.ramo) : undefined;

  const [cola, setCola] = useState<Tarjeta[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hechas, setHechas] = useState(0);
  const [volteada, setVolteada] = useState(false);

  useEffect(() => {
    tarjetasParaHoy(db, filtro)
      .then((t) => {
        setCola(t);
        setTotal(t.length);
      })
      .catch(console.warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, params.ramo]);

  const responder = async (calidad: Calidad) => {
    if (!cola?.length) return;
    const [t, ...resto] = cola;
    await guardarRepaso(db, t, calidad);
    Haptics.selectionAsync().catch(() => {});
    // "Otra vez" la deja al final de la fila de hoy.
    setCola(calidad === 0 ? [...resto, { ...t, reps: 0, interval: 0 }] : resto);
    if (calidad !== 0) setHechas((h) => h + 1);
    setVolteada(false);
  };

  const actual = cola?.[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Repaso' }} />
      {cola === null ? null : !actual ? (
        <View style={styles.fin}>
          <AppText style={{ fontSize: 56, lineHeight: 64 }}>🎉</AppText>
          <AppText variant="title" style={{ textAlign: 'center' }}>{total ? '¡Repaso listo!' : 'Nada que repasar hoy'}</AppText>
          <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {total ? `Repasaste ${hechas} ${hechas === 1 ? 'tarjeta' : 'tarjetas'}. Mañana te muestro las que tocan.` : 'Vuelve mañana o crea tarjetas nuevas.'}
          </AppText>
          <Button label="Volver" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: space.lg }} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.progreso}>
            <View style={{ flex: 1 }}>
              <ProgressBar value={hechas} max={Math.max(total, 1)} />
            </View>
            <AppText variant="caption" tone="tertiary" tabular>{hechas}/{total}</AppText>
          </View>

          <Pressable
            onPress={() => setVolteada(true)}
            accessibilityRole="button"
            accessibilityLabel={volteada ? `Respuesta: ${actual.back}` : `Pregunta: ${actual.front}. Toca para ver la respuesta`}
            style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <AppText variant="overline" tone="tertiary">Pregunta</AppText>
            <AppText variant="title" style={{ marginTop: space.md }}>{actual.front}</AppText>
            {volteada ? (
              <Animated.View entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} style={[styles.respuesta, { borderTopColor: colors.border }]}>
                <AppText variant="overline" tone="accent">Respuesta</AppText>
                <AppText variant="body" style={{ marginTop: space.md }}>{actual.back}</AppText>
              </Animated.View>
            ) : (
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xxl }}>Piensa la respuesta y toca para verla</AppText>
            )}
          </Pressable>

          {volteada ? (
            <View style={styles.botones}>
              {BOTONES.map((b) => (
                <Pressable
                  key={b.calidad}
                  onPress={() => responder(b.calidad)}
                  accessibilityLabel={`${b.label}, vuelve en ${textoIntervalo(actual, b.calidad)}`}
                  style={({ pressed }) => [
                    styles.boton,
                    {
                      backgroundColor: b.calidad === 0 ? colors.dangerSoft : b.calidad === 2 ? colors.accentSoft : colors.surface,
                      borderColor: colors.border,
                      transform: [{ scale: pressed ? 0.97 : 1 }],
                    },
                  ]}
                >
                  <AppText variant="callout" tone={b.calidad === 0 ? 'danger' : b.calidad === 2 ? 'accent' : 'primary'}>{b.label}</AppText>
                  <AppText variant="caption" tone="tertiary">{textoIntervalo(actual, b.calidad)}</AppText>
                </Pressable>
              ))}
            </View>
          ) : (
            <Button label="Ver respuesta" onPress={() => setVolteada(true)} style={{ marginTop: space.xl }} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  progreso: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl },
  tarjeta: { minHeight: 280, borderRadius: radius.lg, borderWidth: 1, padding: space.xxl },
  respuesta: { marginTop: space.xxl, paddingTop: space.xl, borderTopWidth: StyleSheet.hairlineWidth },
  botones: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  boton: { flex: 1, minHeight: 64, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  fin: { flex: 1, padding: space.xxl, alignItems: 'center', justifyContent: 'center', gap: space.md },
});
