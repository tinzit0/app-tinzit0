/**
 * Botón de micrófono con animación de "escuchando".
 * - En reposo: un círculo con el micrófono.
 * - Escuchando: dos anillos que "respiran" y crecen con el volumen de tu voz.
 * La animación corre en el hilo de UI (Reanimated). Con "reducir movimiento"
 * activado, los anillos solo cambian de opacidad.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from './PressableScale';

type Props = {
  escuchando: boolean;
  /** Volumen 0..1 (lo actualiza el reconocedor). */
  volumen: SharedValue<number>;
  onPress: () => void;
  size?: number;
  accessibilityLabel: string;
};

export function MicOrb({ escuchando, volumen, onPress, size = 76, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const reducido = useReducedMotion();
  const respiro = useSharedValue(0);

  useEffect(() => {
    if (escuchando) {
      respiro.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true));
    } else {
      cancelAnimation(respiro);
      respiro.set(withTiming(0, { duration: 200 }));
    }
  }, [escuchando, respiro]);

  // Anillo interior: crece poco con la voz. Anillo exterior: crece más y es más tenue.
  const a1 = useAnimatedStyle(() => {
    const v = volumen.get();
    const r = respiro.get();
    return {
      opacity: escuchando ? 0.14 + v * 0.18 + r * 0.06 : 0,
      transform: [{ scale: reducido ? 1.25 : 1.22 + r * 0.06 + v * 0.35 }],
    };
  });
  const a2 = useAnimatedStyle(() => {
    const v = volumen.get();
    const r = respiro.get();
    return {
      opacity: escuchando ? 0.06 + v * 0.12 + r * 0.04 : 0,
      transform: [{ scale: reducido ? 1.5 : 1.44 + r * 0.08 + v * 0.6 }],
    };
  });

  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent }, a2]} />
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent }, a1]} />
      <PressableScale
        onPress={onPress}
        pressedScale={0.94}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: escuchando ? colors.accent : colors.surfaceRaised,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: escuchando ? colors.accent : colors.border,
        }}
      >
        <Ionicons name={escuchando ? 'mic' : 'mic-outline'} size={size * 0.42} color={escuchando ? colors.onAccent : colors.text} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute' },
});
