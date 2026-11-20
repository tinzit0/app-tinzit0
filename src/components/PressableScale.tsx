/**
 * Botón "que se siente": se achica un poquito (97%) al tocarlo.
 * Esa respuesta instantánea es lo que hace que una app se sienta de calidad.
 * La animación corre en el hilo de UI (Reanimated), así no se traba.
 */
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Curva "ease-out" fuerte: empieza rápido, se siente inmediato.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Cuánto se achica al presionar. 0.97 para botones, 0.98 para tarjetas grandes. */
  pressedScale?: number;
};

export function PressableScale({ style, pressedScale = 0.97, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      // Si el dedo se mueve un poco, el toque no se cancela.
      pressRetentionOffset={{ top: 16, bottom: 16, left: 16, right: 16 }}
      onPressIn={(e) => {
        scale.set(withTiming(pressedScale, { duration: 110, easing: EASE_OUT, reduceMotion: ReduceMotion.System }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: 160, easing: EASE_OUT, reduceMotion: ReduceMotion.System }));
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    />
  );
}
