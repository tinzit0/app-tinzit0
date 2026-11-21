/**
 * Modo enfoque (Pomodoro): 25 min de estudio + 5 de descanso (o 50/10, 15/3).
 * - El tiempo se calcula con la hora de término, así sigue exacto aunque salgas de la app.
 * - Te avisa con una notificación al terminar cada parte.
 * - Cada bloque de enfoque terminado se guarda como estudio del ramo elegido.
 * - Botón para poner lofi en Spotify.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { PressableScale } from '@/components/PressableScale';
import { SegmentedControl } from '@/components/SegmentedControl';
import { listarRamosSimple, minutosEstudio, registrarEstudio, type Ramo } from '@/database/estudio';
import { getSetting, setSetting } from '@/database/queries';
import { formatoHoras } from '@/estudio/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

type Fase = 'enfoque' | 'descanso';
type Modo = '25' | '50' | '15';
const MODOS: Record<Modo, { enfoque: number; descanso: number }> = { '25': { enfoque: 25, descanso: 5 }, '50': { enfoque: 50, descanso: 10 }, '15': { enfoque: 15, descanso: 3 } };

const TAM = 260;
const GROSOR = 10;
const R = (TAM - GROSOR) / 2;
const CIRC = 2 * Math.PI * R;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function PomodoroScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ ramo?: string; auto?: string }>();

  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [ramo, setRamo] = useState<number | null>(params.ramo ? Number(params.ramo) : null);
  const [modo, setModo] = useState<Modo>('25');
  const [fase, setFase] = useState<Fase>('enfoque');
  const [finEn, setFinEn] = useState<number | null>(null); // corriendo si no es null
  const [restante, setRestante] = useState(MODOS['25'].enfoque * 60_000);
  const [ahora, setAhora] = useState(Date.now());
  const [hoyMin, setHoyMin] = useState(0);
  const [ciclos, setCiclos] = useState(0);
  const notif = useRef<string | null>(null);
  const arrancado = useRef(false);

  const duracion = (f: Fase, m: Modo = modo) => MODOS[m][f] * 60_000;

  const cargarHoy = useCallback(async () => {
    const h = toISODate();
    setHoyMin((await minutosEstudio(db, h, h)).total);
  }, [db]);

  useEffect(() => {
    listarRamosSimple(db).then(setRamos).catch(console.warn);
    cargarHoy().catch(console.warn);
    getSetting(db, 'pomodoro_min').then((v) => {
      const m: Modo = v === '50' ? '50' : v === '15' ? '15' : '25';
      setModo(m);
      setRestante(MODOS[m].enfoque * 60_000);
    });
  }, [db, cargarHoy]);

  const cancelarAviso = () => {
    if (notif.current) Notifications.cancelScheduledNotificationAsync(notif.current).catch(() => {});
    notif.current = null;
  };

  const programarAviso = async (f: Fase, ms: number) => {
    cancelarAviso();
    if (Platform.OS === 'web') return;
    try {
      notif.current = await Notifications.scheduleNotificationAsync({
        content: {
          title: f === 'enfoque' ? '¡Bloque de estudio listo! 🎉' : 'Se acabó el descanso ⏱️',
          body: f === 'enfoque' ? 'Tómate un descanso: estira, toma agua.' : 'Vuelve a Tinzit0 para el siguiente bloque.',
          sound: true,
          data: { tipo: 'pomodoro' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(ms / 1000)), channelId: 'tinzit0' },
      });
    } catch {
      // sin permiso de notificaciones: el temporizador igual funciona en pantalla
    }
  };

  const iniciar = useCallback(
    (f: Fase = fase, ms: number = restante) => {
      setFase(f);
      setFinEn(Date.now() + ms);
      setAhora(Date.now());
      programarAviso(f, ms);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fase, restante],
  );

  const pausar = () => {
    if (finEn == null) return;
    setRestante(Math.max(0, finEn - Date.now()));
    setFinEn(null);
    cancelarAviso();
  };

  const reiniciar = () => {
    setFinEn(null);
    cancelarAviso();
    setFase('enfoque');
    setRestante(duracion('enfoque'));
  };

  // Arranque automático si vienes desde la voz ("modo enfoque")
  useEffect(() => {
    if (params.auto === '1' && !arrancado.current) {
      arrancado.current = true;
      const t = setTimeout(() => iniciar('enfoque', duracion('enfoque')), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.auto]);

  // Reloj: una vez por segundo (y al volver a la app).
  useEffect(() => {
    if (finEn == null) return;
    const i = setInterval(() => setAhora(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setAhora(Date.now()));
    return () => {
      clearInterval(i);
      sub.remove();
    };
  }, [finEn]);

  // ¿Terminó la fase?
  useEffect(() => {
    if (finEn == null || ahora < finEn) return;
    notif.current = null; // ya sonó
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (fase === 'enfoque') {
      const min = MODOS[modo].enfoque;
      registrarEstudio(db, ramo, min).then(cargarHoy).catch(console.warn);
      setCiclos((c) => c + 1);
      iniciar('descanso', duracion('descanso'));
    } else {
      setFinEn(null);
      setFase('enfoque');
      setRestante(duracion('enfoque'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ahora, finEn]);

  // Al salir de la pantalla a mitad de un bloque, guardamos lo estudiado (si fueron 5+ min).
  const estado = useRef({ finEn, fase, modo, ramo });
  estado.current = { finEn, fase, modo, ramo };
  useEffect(
    () => () => {
      const e = estado.current;
      cancelarAviso();
      if (e.finEn != null && e.fase === 'enfoque') {
        const hechos = MODOS[e.modo].enfoque - Math.max(0, e.finEn - Date.now()) / 60_000;
        if (hechos >= 5) registrarEstudio(db, e.ramo, Math.floor(hechos)).catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const corriendo = finEn != null;
  const ms = corriendo ? Math.max(0, finEn - ahora) : restante;
  const total = duracion(fase);
  const progreso = 1 - ms / total;
  const color = fase === 'enfoque' ? colors.accent : colors.warning;
  const ramoSel = ramos.find((r) => r.id === ramo);

  const lofi = async () => {
    try {
      const sp = await import('@/spotify/spotify');
      await sp.reproducirBusqueda('lofi para estudiar');
    } catch {
      // sin Spotify: no pasa nada
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Modo enfoque' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {!corriendo && fase === 'enfoque' && restante === total ? (
          <SegmentedControl
            options={[
              { value: '25', label: '25 / 5' },
              { value: '50', label: '50 / 10' },
              { value: '15', label: '15 / 3' },
            ]}
            value={modo}
            onChange={(m) => {
              setModo(m);
              setRestante(MODOS[m].enfoque * 60_000);
              setSetting(db, 'pomodoro_min', m).catch(() => {});
            }}
          />
        ) : (
          <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {ramoSel ? ramoSel.name : 'Estudio general'} · {ciclos} {ciclos === 1 ? 'bloque' : 'bloques'} hoy en esta sesión
          </AppText>
        )}

        {/* Anillo */}
        <View style={styles.anillo} accessible accessibilityLabel={`${fase === 'enfoque' ? 'Enfoque' : 'Descanso'}, quedan ${mmss(ms)}`}>
          <Svg width={TAM} height={TAM} style={StyleSheet.absoluteFill}>
            <Circle cx={TAM / 2} cy={TAM / 2} r={R} stroke={colors.surfaceRaised} strokeWidth={GROSOR} fill="none" />
            <Circle
              cx={TAM / 2}
              cy={TAM / 2}
              r={R}
              stroke={color}
              strokeWidth={GROSOR}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={CIRC * (1 - Math.min(1, Math.max(0, progreso)))}
              transform={`rotate(-90 ${TAM / 2} ${TAM / 2})`}
            />
          </Svg>
          <AppText variant="overline" style={{ color }}>{fase === 'enfoque' ? 'Enfoque' : 'Descanso'}</AppText>
          <AppText tabular style={[styles.reloj, { color: colors.text }]}>{mmss(ms)}</AppText>
          <AppText variant="caption" tone="tertiary">{corriendo ? (fase === 'enfoque' ? 'Celular de lado 📵' : 'Estira, toma agua') : 'En pausa'}</AppText>
        </View>

        {/* Controles */}
        <View style={styles.controles}>
          <PressableScale accessibilityRole="button" onPress={reiniciar} accessibilityLabel="Reiniciar" style={[styles.btnChico, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="refresh" size={22} color={colors.textSecondary} />
          </PressableScale>
          <PressableScale
              accessibilityRole="button"
            onPress={() => (corriendo ? pausar() : iniciar())}
            accessibilityLabel={corriendo ? 'Pausar' : 'Empezar'}
            style={[styles.btnGrande, { backgroundColor: colors.accent }]}
          >
            <Ionicons name={corriendo ? 'pause' : 'play'} size={34} color={colors.onAccent} style={corriendo ? undefined : { marginLeft: 4 }} />
          </PressableScale>
          <PressableScale
              accessibilityRole="button"
            onPress={() => {
              cancelarAviso();
              const sig: Fase = fase === 'enfoque' ? 'descanso' : 'enfoque';
              setFinEn(null);
              setFase(sig);
              setRestante(duracion(sig));
            }}
            accessibilityLabel="Saltar a la siguiente fase"
            style={[styles.btnChico, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="play-skip-forward" size={22} color={colors.textSecondary} />
          </PressableScale>
        </View>

        {/* Ramo */}
        {ramos.length ? (
          <View style={styles.wrap}>
            <Chip compact label="General" selected={ramo == null} onPress={() => setRamo(null)} />
            {ramos.map((r) => (
              <Chip key={r.id} compact label={r.name} selected={ramo === r.id} onPress={() => setRamo(r.id)} leading={<View style={[styles.punto, { backgroundColor: r.color }]} />} />
            ))}
          </View>
        ) : null}

        <View style={{ gap: space.md, marginTop: space.xl }}>
          <Button label="Poner lofi en Spotify 🎧" variant="secondary" onPress={lofi} />
          <AppText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
            Hoy llevas {hoyMin ? formatoHoras(hoyMin / 60) : '0 min'} de estudio.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  anillo: { width: TAM, height: TAM, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: space.xxl, gap: space.xs },
  reloj: { fontFamily: 'Inter_700Bold', fontSize: 60, lineHeight: 68, letterSpacing: -2 },
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxl },
  btnGrande: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  btnChico: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', marginTop: space.xxl },
  punto: { width: 10, height: 10, borderRadius: 5 },
});
