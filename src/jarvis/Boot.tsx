/**
 * Secuencia de arranque del asistente (estilo "iniciando sistemas").
 * Dura ~2 segundos, se puede saltar tocando, y aparece solo la primera vez
 * que abres el asistente desde que abriste la app (no cada vez).
 * Es un momento poco frecuente: por eso se permite algo más de animación.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/AppText';
import { fonts } from '@/theme/tokens';
import { HUD } from './colores';

const LINEAS = [
  'INICIANDO NÚCLEO…',
  'CARGANDO MÓDULOS: TAREAS · GASTOS · GYM · HÁBITOS',
  'SINCRONIZANDO CLIMA…',
  'CALIBRANDO RECONOCIMIENTO DE VOZ…',
  'CARGANDO LO APRENDIDO…',
  'TODOS LOS SISTEMAS EN LÍNEA',
];

let yaArranco = false;
export function debeArrancar() {
  return !yaArranco;
}

export function Boot({ color, onFin }: { color: string; onFin: () => void }) {
  const reducido = useReducedMotion();
  const [visibles, setVisibles] = useState(0);
  const barra = useSharedValue(0);

  // Guardamos onFin en una ref: así la secuencia corre UNA sola vez aunque la pantalla se actualice.
  const finRef = useRef(onFin);
  useEffect(() => {
    finRef.current = onFin;
  }, [onFin]);

  useEffect(() => {
    yaArranco = true;
    const paso = reducido ? 120 : 320;
    const timers = LINEAS.map((_, i) => setTimeout(() => setVisibles(i + 1), 150 + i * paso));
    barra.set(withTiming(1, { duration: 150 + LINEAS.length * paso, easing: Easing.out(Easing.cubic) }));
    const fin = setTimeout(() => finRef.current(), 150 + LINEAS.length * paso + 450);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(fin);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barraStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: barra.get() }] }));

  return (
    <Animated.View exiting={FadeOut.duration(260)} style={[StyleSheet.absoluteFill, styles.fondo]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onFin} accessibilityLabel="Saltar animación de inicio" />
      <View style={styles.centro} pointerEvents="none">
        <AppText style={[styles.titulo, { color }]}>T · I · N · Z · I · T · 0</AppText>
        <AppText style={styles.sub}>ASISTENTE PERSONAL</AppText>
        <View style={[styles.track, { borderColor: `${color}55` }]}>
          <Animated.View style={[styles.fill, { backgroundColor: color }, barraStyle]} />
        </View>
        <View style={styles.log}>
          {LINEAS.slice(0, visibles).map((l, i) => (
            <Animated.View key={l} entering={FadeIn.duration(180)}>
              <AppText style={[styles.linea, i === LINEAS.length - 1 && { color }]}>{`> ${l}`}</AppText>
            </Animated.View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fondo: { backgroundColor: HUD.fondo, zIndex: 10 },
  centro: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  titulo: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: 4, textAlign: 'center' },
  sub: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 4, textAlign: 'center', color: HUD.muyTenue },
  track: { height: 3, borderWidth: 1, borderRadius: 2, overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', width: '100%', transformOrigin: 'left' },
  log: { gap: 6, marginTop: 8, minHeight: 120 },
  linea: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.2, color: HUD.tenue },
});
