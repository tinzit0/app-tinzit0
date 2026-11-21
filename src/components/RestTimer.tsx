/**
 * Temporizador de descanso entre series.
 * - Tiempos rápidos: 60, 90 y 120 segundos (recuerda el último que usaste).
 * - Se inicia solo al agregar una serie (desde EntrenoScreen) o con el botón.
 * - Al terminar: vibración + una notificación con sonido. La notificación
 *   también suena si saliste de la app (por ejemplo, para cambiar la música).
 * La barra se anima en el hilo de UI (Reanimated), así no se traba.
 * El descanso en curso se GUARDA (hora de término y su alarma): si sales de la pantalla
 * la alarma sigue y al volver el contador continúa donde iba.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useSQLiteContext } from 'expo-sqlite';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Vibration, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { getSetting, setSetting } from '@/database/queries';
import { Chip } from './Chip';

const CLAVE = 'descanso_activo';
type Guardado = { finEn: number; total: number; notifId: string | null };

const OPCIONES = [60, 90, 120];

export type RestTimerHandle = { iniciar: () => void };

type Props = { segundos: number; onCambiarSegundos: (s: number) => void };

function mmss(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export const RestTimer = forwardRef<RestTimerHandle, Props>(function RestTimer({ segundos, onCambiarSegundos }, ref) {
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const [finEn, setFinEn] = useState<number | null>(null); // timestamp de término
  const [restante, setRestante] = useState(0);
  const notifId = useRef<string | null>(null);
  const progreso = useSharedValue(0); // 1 = lleno, 0 = terminado

  const limpiarNotif = () => {
    if (notifId.current) Notifications.cancelScheduledNotificationAsync(notifId.current).catch(() => {});
    notifId.current = null;
  };

  const guardar = useCallback(
    (g: Guardado | null) => {
      setSetting(db, CLAVE, g ? JSON.stringify(g) : '').catch(() => {});
    },
    [db],
  );

  const detener = () => {
    setFinEn(null);
    cancelAnimation(progreso);
    progreso.set(0);
    limpiarNotif();
    guardar(null);
  };

  /** Muestra un descanso que termina en `fin` (sin tocar la alarma). */
  const mostrar = (fin: number, total: number) => {
    const resta = Math.max(0, fin - Date.now());
    setFinEn(fin);
    setRestante(Math.ceil(resta / 1000));
    progreso.set(Math.min(1, resta / (total * 1000)));
    progreso.set(withTiming(0, { duration: resta, easing: Easing.linear }));
  };

  const iniciar = (dur = segundos) => {
    limpiarNotif();
    const fin = Date.now() + dur * 1000;
    mostrar(fin, dur);
    guardar({ finEn: fin, total: dur, notifId: null });
    if (Platform.OS !== 'web') {
      Notifications.scheduleNotificationAsync({
        content: { title: 'Descanso listo ⏱️', body: 'A la siguiente serie, tú puedes 💪', sound: true, data: { tipo: 'descanso' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(fin), channelId: 'tinzit0' },
      })
        .then((id) => {
          notifId.current = id;
          guardar({ finEn: fin, total: dur, notifId: id });
        })
        .catch(() => {});
    }
  };

  // Al abrir: si había un descanso corriendo, se retoma (la alarma ya está agendada).
  useEffect(() => {
    getSetting(db, CLAVE)
      .then((raw) => {
        if (!raw) return;
        const g = JSON.parse(raw) as Guardado;
        if (typeof g?.finEn !== 'number' || g.finEn <= Date.now()) {
          guardar(null);
          return;
        }
        notifId.current = g.notifId;
        mostrar(g.finEn, g.total);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const sumar = (s: number) => {
    if (!finEn) return;
    const nuevoFin = finEn + s * 1000;
    const resta = Math.max(1, Math.round((nuevoFin - Date.now()) / 1000));
    iniciar(resta);
  };

  useImperativeHandle(ref, () => ({ iniciar: () => iniciar() }));

  // Reloj: actualiza el número 4 veces por segundo.
  useEffect(() => {
    if (!finEn) return;
    const t = setInterval(() => {
      const r = Math.max(0, Math.ceil((finEn - Date.now()) / 1000));
      setRestante(r);
      if (r === 0) {
        setFinEn(null);
        if (AppState.currentState === 'active') {
          // En pantalla: vibración fuerte y la notificación ya no hace falta.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Vibration.vibrate([0, 250, 120, 250]);
        }
        notifId.current = null;
        guardar(null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [finEn, guardar]);

  // Al salir de la pantalla NO se cancela la alarma: el descanso sigue y al volver se retoma.

  const barra = useAnimatedStyle(() => ({ transform: [{ scaleX: progreso.get() }] }));
  const activo = finEn !== null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: activo ? colors.accent : colors.border }]}>
      <View style={styles.top}>
        <Ionicons name="timer-outline" size={18} color={activo ? colors.accent : colors.textSecondary} />
        <AppText variant="headline" style={{ flex: 1 }}>{activo ? 'Descansando' : 'Descanso'}</AppText>
        {activo ? (
          <AppText variant="title" tabular>{mmss(restante)}</AppText>
        ) : null}
      </View>

      {activo ? (
        <>
          <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}>
            <Animated.View style={[styles.fill, { backgroundColor: colors.accent }, barra]} />
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => sumar(15)} hitSlop={8} accessibilityRole="button" style={styles.action}>
              <AppText variant="callout" tone="accent">+15 s</AppText>
            </Pressable>
            <Pressable onPress={detener} hitSlop={8} accessibilityRole="button" style={styles.action}>
              <AppText variant="callout" tone="secondary">Saltar</AppText>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.chips}>
          {OPCIONES.map((s) => (
            <Chip
              key={s}
              compact
              label={`${s} s`}
              selected={segundos === s}
              onPress={() => {
                onCambiarSegundos(s);
                iniciar(s);
              }}
              accessibilityLabel={`Descansar ${s} segundos`}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', width: '100%', transformOrigin: 'left' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { minHeight: 36, justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: space.sm },
});
