/**
 * "Estoy a mil": guía de 2–3 minutos para bajar una emoción muy intensa (habilidades DBT).
 *   1) ¿Qué tan fuerte es? (0–10)
 *   2) Respiración lenta (inhalar 4 s, exhalar 6 s) con vibración suave
 *   3) TIPP: agua fría / mover el cuerpo / tensar y soltar
 *   4) Anclarte: 5 cosas que ves, 4 que tocas, 3 que oyes…
 *   5) ¿Cómo quedó? → se guarda para ver cuánto te ayuda
 * Con ?modo=respirar solo hace la respiración.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useKeepAwake } from 'expo-keep-awake';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Escala } from '@/components/Escala';
import { registrarCalma } from '@/database/bienestar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Paso = 'antes' | 'respirar' | 'tipp' | 'anclar' | 'despues' | 'fin';

const INHALA = 4000;
const EXHALA = 6000;
const CICLOS = 6; // ~1 minuto

const ANCLAS = [
  { n: 5, que: 'cosas que puedes ver', icono: 'eye-outline' },
  { n: 4, que: 'cosas que puedes tocar', icono: 'hand-left-outline' },
  { n: 3, que: 'sonidos que puedes oír', icono: 'ear-outline' },
  { n: 2, que: 'olores que puedes sentir', icono: 'flower-outline' },
  { n: 1, que: 'cosa buena de ti o de hoy', icono: 'heart-outline' },
] as const;

const TIPP = [
  { clave: 'frio', titulo: 'Agua fría', texto: 'Moja tu cara con agua muy fría o sostén hielo en las manos. Baja el ritmo del corazón en segundos.', seg: 30, icono: 'snow-outline' },
  { clave: 'mover', titulo: 'Mueve el cuerpo', texto: 'Salta, haz sentadillas o corre en el lugar, lo más fuerte que puedas.', seg: 60, icono: 'flash-outline' },
  { clave: 'soltar', titulo: 'Tensa y suelta', texto: 'Aprieta los puños y los hombros 5 segundos… y suelta. Repite con piernas y cara.', seg: 45, icono: 'body-outline' },
] as const;

const EASE = Easing.bezier(0.45, 0, 0.55, 1); // suave de ida y vuelta, como una respiración

/** Círculo que crece al inhalar y se achica al exhalar. */
function Respiracion({ onListo }: { onListo: () => void }) {
  const { colors } = useTheme();
  const reducido = useReducedMotion();
  const escala = useSharedValue(0.62);
  const [fase, setFase] = useState<'Inhala' | 'Exhala'>('Inhala');
  const [ciclo, setCiclo] = useState(1);
  useKeepAwake();

  useEffect(() => {
    if (!reducido) {
      escala.set(
        withRepeat(
          withSequence(withTiming(1, { duration: INHALA, easing: EASE }), withTiming(0.62, { duration: EXHALA, easing: EASE })),
          CICLOS,
          false,
        ),
      );
    }
    const inicio = Date.now();
    let ultimaFase = 'Inhala';
    const id = setInterval(() => {
      const t = Date.now() - inicio;
      const c = Math.floor(t / (INHALA + EXHALA));
      if (c >= CICLOS) {
        clearInterval(id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onListo();
        return;
      }
      const f = t % (INHALA + EXHALA) < INHALA ? 'Inhala' : 'Exhala';
      if (f !== ultimaFase) {
        ultimaFase = f;
        Haptics.selectionAsync().catch(() => {});
      }
      setFase(f);
      setCiclo(c + 1);
    }, 200);
    return () => {
      clearInterval(id);
      cancelAnimation(escala);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estilo = useAnimatedStyle(() => ({ transform: [{ scale: escala.get() }] }));

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.circuloWrap}>
        <View style={[styles.circuloBorde, { borderColor: colors.border }]} />
        <Animated.View style={[styles.circulo, { backgroundColor: colors.accentSoft, borderColor: colors.accent }, estilo]} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.centro}>
            <AppText variant="title">{fase}</AppText>
            <AppText variant="caption" tone="tertiary">{fase === 'Inhala' ? 'por la nariz · 4 s' : 'lento por la boca · 6 s'}</AppText>
          </View>
        </View>
      </View>
      <AppText variant="callout" tone="secondary" tabular style={{ marginTop: space.lg }}>
        Respiración {ciclo} de {CICLOS}
      </AppText>
    </View>
  );
}

/** Cuenta regresiva simple para un ejercicio TIPP. */
function useCuenta() {
  const [queda, setQueda] = useState(0);
  const fin = useRef(0);
  useEffect(() => {
    if (queda <= 0) return;
    const id = setTimeout(() => {
      const q = Math.max(0, Math.ceil((fin.current - Date.now()) / 1000));
      setQueda(q);
      if (q === 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [queda]);
  return {
    queda,
    iniciar: (seg: number) => {
      fin.current = Date.now() + seg * 1000;
      setQueda(seg);
    },
  };
}

export function CalmaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { modo } = useLocalSearchParams<{ modo?: string }>();
  const soloRespirar = modo === 'respirar';
  const [paso, setPaso] = useState<Paso>(soloRespirar ? 'respirar' : 'antes');
  const [antes, setAntes] = useState<number | null>(null);
  const [despues, setDespues] = useState<number | null>(null);
  const [respiroListo, setRespiroListo] = useState(false);
  const [ancla, setAncla] = useState(0);
  const [activo, setActivo] = useState<string | null>(null);
  const cuenta = useCuenta();

  const terminar = async () => {
    await registrarCalma(db, { tipo: 'calma', antes, despues }).catch(() => {});
    setPaso('fin');
  };

  const titulo = soloRespirar ? 'Respirar' : 'Estoy a mil';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: titulo }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {paso === 'antes' ? (
          <>
            <AppText variant="title">Estoy contigo.</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm }}>
              Lo que sientes es muy fuerte, pero va a bajar. Vamos paso a paso, sin apuro.
            </AppText>
            <AppText variant="overline" tone="tertiary" style={{ marginTop: space.xxl, marginBottom: space.md }}>
              ¿Qué tan intenso es ahora?
            </AppText>
            <Escala value={antes} onChange={setAntes} etiquetas={['Tranquilo/a', 'Lo máximo']} accessibilityLabel="Intensidad de 0 a 10" />
            <Button label="Empezar" onPress={() => setPaso('respirar')} style={{ marginTop: space.xxl }} />
            <Button label="Saltar y empezar" variant="secondary" onPress={() => setPaso('respirar')} style={{ marginTop: space.sm }} />
          </>
        ) : null}

        {paso === 'respirar' ? (
          <>
            <AppText variant="title">Respira con el círculo</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm, marginBottom: space.xxl }}>
              Botar el aire más lento de lo que lo tomas le avisa a tu cuerpo que está a salvo.
            </AppText>
            <Respiracion onListo={() => setRespiroListo(true)} />
            <Button
              label={respiroListo ? 'Siguiente' : 'Seguir sin terminar'}
              variant={respiroListo ? 'primary' : 'secondary'}
              onPress={() => (soloRespirar ? setPaso('fin') : setPaso('tipp'))}
              style={{ marginTop: space.xxl }}
            />
          </>
        ) : null}

        {paso === 'tipp' ? (
          <>
            <AppText variant="title">Baja la intensidad con el cuerpo</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm, marginBottom: space.xl }}>
              Elige uno. El cuerpo calma a la mente más rápido que pensar.
            </AppText>
            <View style={{ gap: space.md }}>
              {TIPP.map((x) => {
                const corriendo = activo === x.clave && cuenta.queda > 0;
                const hecho = activo === x.clave && cuenta.queda === 0;
                return (
                  <Card key={x.clave} style={activo === x.clave ? { borderColor: colors.accent } : undefined}>
                    <View style={styles.fila}>
                      <Ionicons name={x.icono} size={22} color={colors.accent} />
                      <AppText variant="headline" style={{ flex: 1 }}>{x.titulo}</AppText>
                      {corriendo ? <AppText variant="number" tabular>{cuenta.queda}</AppText> : null}
                      {hecho ? <Ionicons name="checkmark-circle" size={24} color={colors.accent} /> : null}
                    </View>
                    <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm }}>{x.texto}</AppText>
                    {!corriendo ? (
                      <Button
                        label={hecho ? 'Otra vez' : `Hacerlo (${x.seg} s)`}
                        variant="secondary"
                        onPress={() => {
                          setActivo(x.clave);
                          cuenta.iniciar(x.seg);
                        }}
                        style={{ marginTop: space.md }}
                      />
                    ) : null}
                  </Card>
                );
              })}
            </View>
            <Button label="Siguiente" onPress={() => setPaso('anclar')} style={{ marginTop: space.xxl }} />
          </>
        ) : null}

        {paso === 'anclar' ? (
          <>
            <AppText variant="title">Vuelve al presente</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm, marginBottom: space.xxl }}>
              Dilo en voz alta o en tu cabeza. No hay respuestas malas.
            </AppText>
            <Card style={{ alignItems: 'center', paddingVertical: space.xxxl }}>
              <Ionicons name={ANCLAS[ancla].icono} size={32} color={colors.accent} />
              <AppText variant="display" tabular style={{ marginTop: space.md }}>{ANCLAS[ancla].n}</AppText>
              <AppText variant="headline" style={{ textAlign: 'center' }}>{ANCLAS[ancla].que}</AppText>
            </Card>
            <View style={styles.puntos}>
              {ANCLAS.map((_, k) => (
                <View key={k} style={[styles.punto, { backgroundColor: k <= ancla ? colors.accent : colors.surfaceRaised }]} />
              ))}
            </View>
            <Button
              label={ancla < ANCLAS.length - 1 ? 'Listo' : 'Siguiente'}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                if (ancla < ANCLAS.length - 1) setAncla(ancla + 1);
                else setPaso('despues');
              }}
              style={{ marginTop: space.xl }}
            />
          </>
        ) : null}

        {paso === 'despues' ? (
          <>
            <AppText variant="title">¿Cómo estás ahora?</AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm, marginBottom: space.xxl }}>
              Aunque haya bajado poco, ya es un avance.
            </AppText>
            <Escala value={despues} onChange={setDespues} etiquetas={['Tranquilo/a', 'Lo máximo']} accessibilityLabel="Intensidad ahora de 0 a 10" />
            <Button label="Terminar" onPress={terminar} style={{ marginTop: space.xxl }} />
          </>
        ) : null}

        {paso === 'fin' ? (
          <>
            <Ionicons name="heart" size={36} color={colors.accent} />
            <AppText variant="title" style={{ marginTop: space.md }}>
              {antes != null && despues != null && despues < antes
                ? `Bajó de ${antes} a ${despues}. Lo hiciste tú.`
                : 'Gracias por darte este momento.'}
            </AppText>
            <AppText variant="body" tone="secondary" style={{ marginTop: space.sm }}>
              {despues != null && despues >= 7
                ? 'Todavía está fuerte, y está bien. Puedes repetir, surfear el impulso o hablar con alguien de tu plan.'
                : 'Cuando puedas, anota en tu tarjeta qué pasó. Así aprendes qué te ayuda.'}
            </AppText>
            <View style={{ gap: space.sm, marginTop: space.xxl }}>
              {despues != null && despues >= 7 ? (
                <Button label="Abrir mi plan de crisis" onPress={() => router.replace('/plan-crisis')} />
              ) : (
                <Button label="Anotar en mi tarjeta" onPress={() => router.replace('/tarjeta-diaria')} />
              )}
              <Button label="Surfear un impulso" variant="secondary" onPress={() => router.replace('/impulso')} />
              <Button
                label="Repetir"
                variant="secondary"
                onPress={() => {
                  setAncla(0);
                  setRespiroListo(false);
                  setActivo(null);
                  setDespues(null);
                  setPaso(soloRespirar ? 'respirar' : 'antes');
                }}
              />
            </View>
          </>
        ) : null}

        <PressableLinea onPress={() => Linking.openURL('tel:*4141').catch(() => {})} />
      </ScrollView>
    </View>
  );
}

/** Línea de ayuda siempre visible al final. */
function PressableLinea({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel="Llamar a la línea de prevención *4141" style={[styles.fila, { marginTop: space.xxxl, borderRadius: radius.md }]}>
      <Ionicons name="call-outline" size={18} color={colors.textSecondary} />
      <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
        ¿Sientes que puedes hacerte daño? Llama gratis al *4141, las 24 horas.
      </AppText>
    </Card>
  );
}

const TAM = 240;
const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  circuloWrap: { width: TAM, height: TAM, alignItems: 'center', justifyContent: 'center' },
  circuloBorde: { position: 'absolute', width: TAM, height: TAM, borderRadius: TAM / 2, borderWidth: 1 },
  circulo: { width: TAM, height: TAM, borderRadius: TAM / 2, borderWidth: 2 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginTop: space.lg },
  punto: { width: 8, height: 8, borderRadius: 4 },
});
