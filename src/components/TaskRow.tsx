/**
 * Fila de una tarea: círculo para marcarla, título y detalles (prioridad, cuándo).
 * - Tocar el círculo: marca/desmarca (con vibración corta).
 * - Tocar el resto: abre la tarea para editarla.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { describirCuando, type TareaDelDia } from '@/database/tareas';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type Props = {
  tarea: TareaDelDia;
  onToggle: (hecha: boolean) => void;
  onPress: () => void;
  /** Oculta "Hoy" en los detalles cuando ya estamos viendo hoy. */
  ocultarHoy?: boolean;
};

export function TaskRow({ tarea, onToggle, onPress, ocultarHoy }: Props) {
  const { colors } = useTheme();
  const colorPrioridad = { alta: colors.danger, media: colors.warning, baja: colors.textTertiary }[tarea.priority];

  // Animación del check: crece desde 0.6 y aparece. Nunca desde 0.
  const progreso = useSharedValue(tarea.hecha ? 1 : 0);
  useEffect(() => {
    progreso.set(withTiming(tarea.hecha ? 1 : 0, { duration: 180, easing: EASE_OUT, reduceMotion: ReduceMotion.System }));
  }, [tarea.hecha, progreso]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: progreso.get(),
    transform: [{ scale: 0.6 + progreso.get() * 0.4 }],
  }));

  const cuando = describirCuando(tarea);
  const detalles = [
    tarea.atrasada ? 'Atrasada' : cuando === 'Hoy' && ocultarHoy ? null : cuando,
  ].filter(Boolean) as string[];

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        onPress={() => {
          const nueva = !tarea.hecha;
          // Vibración en el mismo momento del cambio visual.
          if (nueva) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          else Haptics.selectionAsync().catch(() => {});
          onToggle(nueva);
        }}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: tarea.hecha }}
        accessibilityLabel={`Marcar ${tarea.title}`}
        style={styles.checkHit}
      >
        <View
          style={[
            styles.check,
            { borderColor: tarea.hecha ? colors.accent : colorPrioridad },
          ]}
        >
          <Animated.View style={[styles.checkFill, { backgroundColor: colors.accent }, checkStyle]}>
            <Ionicons name="checkmark" size={15} color={colors.onAccent} />
          </Animated.View>
        </View>
      </Pressable>

      <Pressable
        onPress={onPress}
        style={styles.body}
        accessibilityRole="button"
        accessibilityLabel={`Editar ${tarea.title}`}
      >
        <AppText
          variant="callout"
          tone={tarea.hecha ? 'tertiary' : 'primary'}
          style={tarea.hecha && { textDecorationLine: 'line-through' }}
          numberOfLines={2}
        >
          {tarea.title}
        </AppText>
        {detalles.length > 0 || tarea.repeat_type !== 'none' ? (
          <View style={styles.meta}>
            {tarea.repeat_type !== 'none' ? (
              <Ionicons name="repeat" size={13} color={colors.textTertiary} />
            ) : null}
            {detalles.map((d) => (
              <AppText key={d} variant="caption" tone={d === 'Atrasada' ? 'danger' : 'tertiary'}>
                {d}
              </AppText>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingRight: space.lg,
    minHeight: 60,
  },
  checkHit: { paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.md },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  checkFill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, paddingVertical: space.md, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
