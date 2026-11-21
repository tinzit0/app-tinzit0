/**
 * Reactor holográfico: el "rostro" del asistente.
 *
 * Capas (de afuera hacia adentro), cada una gira por su cuenta:
 *  1. Anillo de marcas (como un dial) — gira lento.
 *  2. Tres arcos gruesos — giran al revés; rápido cuando está "pensando".
 *  3. Anillo punteado — gira lento.
 *  4. Núcleo luminoso — crece con el volumen de tu voz y "respira" al hablar.
 *
 * Todo corre en el hilo de UI (Reanimated): no se traba aunque la app esté ocupada.
 * Con "reducir movimiento" activado, los anillos se quedan quietos y solo cambia el brillo.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';

export type EstadoReactor = 'reposo' | 'escuchando' | 'pensando' | 'hablando';

type Props = {
  estado: EstadoReactor;
  color: string;
  /** 0..1, volumen del micrófono */
  volumen: SharedValue<number>;
  /** Cambia este número para disparar el efecto (escaneo o pulso). */
  efecto?: { tipo: 'scan' | 'pulse'; id: number } | null;
  size?: number;
};

function arco(cx: number, cy: number, r: number, desde: number, hasta: number) {
  const rad = (g: number) => ((g - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(desde));
  const y0 = cy + r * Math.sin(rad(desde));
  const x1 = cx + r * Math.cos(rad(hasta));
  const y1 = cy + r * Math.sin(rad(hasta));
  return `M ${x0} ${y0} A ${r} ${r} 0 ${hasta - desde > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Hook: valor que gira 0→360 sin parar, con la duración indicada. */
function useGiro(duracion: number, activo: boolean, sentido: 1 | -1) {
  const v = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(v);
    if (!activo) return;
    const inicio = v.get() % 360;
    v.set(inicio);
    v.set(withRepeat(withTiming(inicio + 360 * sentido, { duration: duracion, easing: Easing.linear }), -1, false));
  }, [duracion, activo, sentido, v]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${v.get()}deg` }] }));
}

export function Reactor({ estado, color, volumen, efecto, size = 260 }: Props) {
  const reducido = useReducedMotion();
  const mov = !reducido;
  const c = size / 2;

  // Velocidad de los anillos según el estado
  const rapido = estado === 'pensando';
  const g1 = useGiro(rapido ? 9000 : 40000, mov, 1);
  const g2 = useGiro(rapido ? 1600 : estado === 'escuchando' ? 6000 : 14000, mov, -1);
  const g3 = useGiro(rapido ? 4000 : 22000, mov, 1);

  // "Respiración" del núcleo: más marcada al hablar
  const respiro = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(respiro);
    const dur = estado === 'hablando' ? 520 : estado === 'pensando' ? 700 : 2200;
    respiro.set(withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [estado, respiro]);

  const nucleo = useAnimatedStyle(() => {
    const v = estado === 'escuchando' ? volumen.get() : 0;
    const r = respiro.get();
    const amp = estado === 'hablando' ? 0.1 : estado === 'reposo' ? 0.03 : 0.06;
    return {
      opacity: 0.55 + r * 0.35 + v * 0.1,
      transform: [{ scale: mov ? 1 + r * amp + v * 0.28 : 1 }],
    };
  });

  const halo = useAnimatedStyle(() => {
    const v = estado === 'escuchando' ? volumen.get() : 0;
    return { opacity: 0.12 + respiro.get() * 0.12 + v * 0.25, transform: [{ scale: mov ? 1 + v * 0.15 : 1 }] };
  });

  // Efectos: escaneo (línea que barre) y pulso (anillo que se expande)
  const scan = useSharedValue(-1);
  const pulso = useSharedValue(0);
  useEffect(() => {
    if (!efecto) return;
    if (efecto.tipo === 'scan') {
      scan.set(-1);
      scan.set(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(-1.2, { duration: 0 })));
    } else {
      pulso.set(0);
      pulso.set(withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    }
  }, [efecto, scan, pulso]);
  const scanStyle = useAnimatedStyle(() => ({
    opacity: scan.get() > -1 && scan.get() < 1 ? 0.9 : 0,
    transform: [{ translateY: scan.get() * (size / 2) }],
  }));
  const pulsoStyle = useAnimatedStyle(() => ({
    opacity: pulso.get() > 0 && pulso.get() < 1 ? 1 - pulso.get() : 0,
    transform: [{ scale: 0.6 + pulso.get() * 0.9 }],
  }));

  const ticks = Array.from({ length: 72 }, (_, k) => {
    const ang = (k * 5 * Math.PI) / 180;
    const largo = k % 6 === 0 ? 10 : 4;
    const r1 = c - 6;
    const r2 = r1 - largo;
    return (
      <Line
        key={k}
        x1={c + r1 * Math.cos(ang)}
        y1={c + r1 * Math.sin(ang)}
        x2={c + r2 * Math.cos(ang)}
        y2={c + r2 * Math.sin(ang)}
        stroke={color}
        strokeOpacity={k % 6 === 0 ? 0.8 : 0.35}
        strokeWidth={k % 6 === 0 ? 2 : 1}
      />
    );
  });

  const capa = { position: 'absolute' as const, width: size, height: size };

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`Asistente ${estado}`}>
      {/* Halo exterior */}
      <Animated.View style={[capa, halo]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0.45" stopColor={color} stopOpacity={0.5} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c} fill="url(#halo)" />
        </Svg>
      </Animated.View>

      {/* 1. Dial de marcas */}
      <Animated.View style={[capa, g1]}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={c - 4} stroke={color} strokeOpacity={0.25} strokeWidth={1} fill="none" />
          <G>{ticks}</G>
        </Svg>
      </Animated.View>

      {/* 2. Arcos gruesos */}
      <Animated.View style={[capa, g2]}>
        <Svg width={size} height={size}>
          {[0, 120, 240].map((a) => (
            <Path key={a} d={arco(c, c, c * 0.74, a + 8, a + 92)} stroke={color} strokeWidth={7} strokeLinecap="round" fill="none" strokeOpacity={0.9} />
          ))}
          {[60, 180, 300].map((a) => (
            <Path key={a} d={arco(c, c, c * 0.74, a - 6, a + 6)} stroke={color} strokeWidth={2} fill="none" strokeOpacity={0.5} />
          ))}
        </Svg>
      </Animated.View>

      {/* 3. Anillo punteado + anillo interior */}
      <Animated.View style={[capa, g3]}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={c * 0.6} stroke={color} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="2 7" fill="none" />
          <Circle cx={c} cy={c} r={c * 0.48} stroke={color} strokeOpacity={0.35} strokeWidth={1} fill="none" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <Path key={a} d={arco(c, c, c * 0.48, a, a + 22)} stroke={color} strokeWidth={3} fill="none" strokeOpacity={0.85} />
          ))}
        </Svg>
      </Animated.View>

      {/* 4. Núcleo */}
      <Animated.View style={[capa, nucleo]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="nucleo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
              <Stop offset="0.35" stopColor={color} stopOpacity={0.9} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c * 0.34} fill="url(#nucleo)" />
          <Circle cx={c} cy={c} r={c * 0.2} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.5} fill="none" />
        </Svg>
      </Animated.View>

      {/* Efecto pulso */}
      <Animated.View style={[capa, pulsoStyle]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={c * 0.7} stroke={color} strokeWidth={3} fill="none" />
        </Svg>
      </Animated.View>

      {/* Efecto escaneo */}
      <Animated.View style={[styles.scan, { top: size / 2, width: size, backgroundColor: color, shadowColor: color }, scanStyle]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  scan: { position: 'absolute', left: 0, height: 2, shadowOpacity: 1, shadowRadius: 10, elevation: 4 },
});
