/**
 * El chanchito dibujado a mano (SVG). Se va "llenando" de abajo hacia arriba según la meta.
 * Cada vez que `monedas` sube, cae una moneda por la ranura y el chanchito da un saltito.
 * - Moneda: translateY + opacity (ease-out, 360 ms); al caer, el cuerpo hace scale 1 → 1,05 → 1.
 * - Reducir movimiento: sin caída ni salto (el número cambia igual).
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

type Props = {
  /** 0 a 1: qué tan lleno se ve (según la meta). Sin meta, se ve con un poquito. */
  lleno: number;
  /** Contador que sube cada vez que echas plata (dispara la moneda). */
  monedas: number;
  size?: number;
};

export function Chanchito({ lleno, monedas, size = 220 }: Props) {
  const { colors } = useTheme();
  const reducido = useReducedMotion();
  const caida = useSharedValue(0); // 0 = arriba (invisible), 1 = dentro de la ranura
  const salto = useSharedValue(1);
  const previas = useRef(monedas);

  useEffect(() => {
    if (monedas <= previas.current) {
      previas.current = monedas;
      return;
    }
    previas.current = monedas;
    if (reducido) return;
    caida.set(0);
    caida.set(withTiming(1, { duration: 360, easing: EASE_OUT, reduceMotion: ReduceMotion.System }));
    salto.set(
      withSequence(
        withTiming(1, { duration: 300 }),
        withTiming(1.05, { duration: 110, easing: EASE_OUT, reduceMotion: ReduceMotion.System }),
        withTiming(1, { duration: 180, easing: EASE_IN_OUT, reduceMotion: ReduceMotion.System }),
      ),
    );
  }, [monedas, reducido, caida, salto]);

  const monedaStyle = useAnimatedStyle(() => {
    const v = caida.get();
    return {
      opacity: v === 0 ? 0 : v < 0.85 ? 1 : (1 - v) / 0.15,
      transform: [{ translateY: -size * 0.32 + v * size * 0.3 }, { scale: 0.96 + v * 0.04 }],
    };
  });
  const cuerpoStyle = useAnimatedStyle(() => ({ transform: [{ scale: salto.get() }] }));

  const nivel = Math.max(0.06, Math.min(1, lleno));
  const W = 200;
  const H = 160;
  // El relleno sube desde la base del cuerpo (y=140) hasta arriba (y=34).
  const yRelleno = 140 - nivel * 106;
  const trazo = colors.text;

  return (
    <View style={{ width: size, height: size * 0.84, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ width: size, height: size * (H / W) }, cuerpoStyle]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <ClipPath id="cuerpo">
              <Ellipse cx="98" cy="87" rx="70" ry="53" />
            </ClipPath>
          </Defs>
          {/* Patitas */}
          <Rect x="52" y="122" width="16" height="26" rx="6" fill={colors.surfaceRaised} stroke={trazo} strokeWidth="3" />
          <Rect x="122" y="122" width="16" height="26" rx="6" fill={colors.surfaceRaised} stroke={trazo} strokeWidth="3" />
          {/* Colita */}
          <Path d="M28 80 c-12 -4 -14 10 -4 10 c8 0 6 -12 -4 -10" fill="none" stroke={trazo} strokeWidth="3" strokeLinecap="round" />
          {/* Oreja de atrás */}
          <Path d="M114 44 C116 24 128 18 136 22 C140 30 140 40 136 48 Z" fill={colors.surfaceRaised} stroke={trazo} strokeWidth="3" strokeLinejoin="round" />
          {/* Cuerpo + relleno según la meta */}
          <Ellipse cx="98" cy="87" rx="70" ry="53" fill={colors.surface} />
          <G clipPath="url(#cuerpo)">
            <Rect x="20" y={yRelleno} width="160" height={150 - yRelleno} fill={colors.accentSoft} />
            <Rect x="20" y={yRelleno} width="160" height="3" fill={colors.accent} opacity={0.6} />
          </G>
          <Ellipse cx="98" cy="87" rx="70" ry="53" fill="none" stroke={trazo} strokeWidth="3" />
          {/* Oreja de adelante */}
          <Path d="M132 48 C134 28 148 20 156 26 C160 36 158 48 152 56 Z" fill={colors.surface} stroke={trazo} strokeWidth="3" strokeLinejoin="round" />
          {/* Hocico */}
          <Ellipse cx="170" cy="92" rx="16" ry="19" fill={colors.surfaceRaised} stroke={trazo} strokeWidth="3" />
          <Circle cx="166" cy="88" r="2.6" fill={trazo} />
          <Circle cx="166" cy="97" r="2.6" fill={trazo} />
          {/* Ojo y mejilla */}
          <Circle cx="140" cy="70" r="4" fill={trazo} />
          <Ellipse cx="142" cy="96" rx="7" ry="4" fill={colors.accent} opacity={0.35} />
          {/* Ranura */}
          <Rect x="76" y="34" width="36" height="7" rx="3.5" fill={trazo} />
        </Svg>
      </Animated.View>

      {/* Moneda que cae en la ranura */}
      <Animated.View pointerEvents="none" style={[styles.moneda, { top: size * 0.23 - 15, left: size * 0.47 - 14, backgroundColor: colors.accent, borderColor: trazo }, monedaStyle]}>
        <Svg width={28} height={28} viewBox="0 0 28 28">
          <SvgText x="14" y="19" fontSize="15" fontWeight="bold" textAnchor="middle" fill={colors.onAccent}>
            $
          </SvgText>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  moneda: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
