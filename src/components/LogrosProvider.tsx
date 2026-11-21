/**
 * Revisa los logros y celebra los nuevos con una animación.
 *
 * - revisar(): se llama al cambiar de pantalla, al volver a la app y después
 *   de acciones importantes. Si hay medallas nuevas, aparecen una por una.
 * - La celebración es poco frecuente, así que se permite un poco de "show":
 *   la medalla entra con un rebote suave, gira un poquito y suelta chispas.
 *   Si tienes "reducir movimiento" activado en el celular, solo aparece con un fundido.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { evaluarLogros, logrosSinVer, marcarVisto, type Logro } from '@/database/logros';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

type Ctx = { revisar: (forzar?: boolean) => void };
const LogrosContext = createContext<Ctx>({ revisar: () => {} });

export function useLogros() {
  return useContext(LogrosContext);
}

export function LogrosProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [cola, setCola] = useState<Logro[]>([]);
  const revisando = useRef(false);

  const ultima = useRef(0);

  const revisar = useCallback((forzar?: boolean) => {
    // Al cambiar de pantalla: como mucho una revisión cada 4 segundos.
    // Después de una acción (forzar = true): siempre.
    if (revisando.current || (forzar !== true && Date.now() - ultima.current < 4000)) return;
    ultima.current = Date.now();
    revisando.current = true;
    (async () => {
      await evaluarLogros(db);
      const sinVer = await logrosSinVer(db);
      if (sinVer.length) setCola((c) => (c.length ? c : sinVer));
    })()
      .catch(console.warn)
      .finally(() => {
        revisando.current = false;
      });
  }, [db]);

  useEffect(() => {
    revisar();
  }, [revisar]);

  const cerrar = async () => {
    const [actual, ...resto] = cola;
    if (actual) await marcarVisto(db, actual.key).catch(() => {});
    setCola(resto);
  };

  return (
    <LogrosContext.Provider value={{ revisar }}>
      {children}
      {cola[0] ? <Celebracion key={cola[0].key} logro={cola[0]} onClose={cerrar} /> : null}
    </LogrosContext.Provider>
  );
}

const CHISPAS = 12;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

function Chispa({ i, color, reducido }: { i: number; color: string; reducido: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!reducido) p.set(withDelay(120, withTiming(1, { duration: 750, easing: EASE_OUT })));
  }, [p, reducido]);
  const ang = (i / CHISPAS) * Math.PI * 2;
  const dist = 78 + (i % 3) * 14;
  const estilo = useAnimatedStyle(() => ({
    opacity: p.get() === 0 ? 0 : 1 - p.get(),
    transform: [
      { translateX: Math.cos(ang) * dist * p.get() },
      { translateY: Math.sin(ang) * dist * p.get() },
      { scale: 1 - p.get() * 0.5 },
    ],
  }));
  return <Animated.View style={[styles.chispa, { backgroundColor: color }, estilo]} />;
}

function Celebracion({ logro, onClose }: { logro: Logro; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const reducido = useReducedMotion();
  const fondo = useSharedValue(0);
  const tarjeta = useSharedValue(0);
  const giro = useSharedValue(reducido ? 0 : -14);

  useEffect(() => {
    fondo.set(withTiming(1, { duration: 220, easing: EASE_OUT }));
    tarjeta.set(reducido ? withTiming(1, { duration: 220 }) : withSpring(1, { duration: 520, dampingRatio: 0.65 }));
    if (!reducido) giro.set(withSpring(0, { duration: 700, dampingRatio: 0.5 }));
    // La vibración va en el mismo momento en que aparece la medalla.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [fondo, tarjeta, giro, reducido]);

  const fondoStyle = useAnimatedStyle(() => ({ opacity: fondo.get() }));
  const tarjetaStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, tarjeta.get() * 1.5),
    transform: [{ scale: reducido ? 1 : 0.88 + tarjeta.get() * 0.12 }],
  }));
  const medallaStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.get()}deg` }] }));

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, fondoStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, tarjetaStyle]}
          accessibilityViewIsModal
          accessibilityLiveRegion="assertive"
        >
          <View style={styles.medallaWrap}>
            {Array.from({ length: CHISPAS }, (_, i) => (
              <Chispa key={i} i={i} color={i % 2 ? logro.color : colors.accent} reducido={reducido} />
            ))}
            <Animated.View style={[styles.medalla, { backgroundColor: `${logro.color}26`, borderColor: logro.color }, medallaStyle]}>
              <Ionicons name={logro.icon as keyof typeof Ionicons.glyphMap} size={44} color={logro.color} />
            </Animated.View>
          </View>
          <AppText variant="overline" tone="accent">¡Logro desbloqueado!</AppText>
          <AppText variant="title" style={{ textAlign: 'center' }}>{logro.titulo}</AppText>
          <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>{logro.descripcion}</AppText>
          <Button label="¡Vamos!" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: space.lg }} />
          <Pressable
            onPress={() => {
              onClose();
              router.push('/logros');
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <AppText variant="callout" tone="secondary">Ver todas mis medallas</AppText>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg + 4,
    borderWidth: 1,
    padding: space.xxl,
    alignItems: 'center',
    gap: space.sm,
  },
  medallaWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  medalla: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chispa: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
});
