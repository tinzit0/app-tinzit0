/**
 * Modo enfoque (Pomodoro): 25 min de estudio + 5 de descanso (o 50/10, 15/3).
 * - La sesión (fase, hora de término, pausa) se GUARDA: si sales de la pantalla o cierras la app,
 *   sigue corriendo y al volver la recuperas. La alarma no se cancela al navegar.
 * - Cada bloque de enfoque terminado se registra UNA sola vez (id del bloque, en transacción).
 * - "Terminar" corta la sesión y guarda lo estudiado si fueron 5+ minutos.
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
import { listarRamosSimple, minutosEstudio, registrarBloque, type Ramo } from '@/database/estudio';
import { getSetting, setSetting } from '@/database/queries';
import { formatoHoras } from '@/estudio/logica';
import {
  avanzar,
  duracionFase,
  iniciar as iniciarSesion,
  leerSesion,
  minutosHechos,
  pausar as pausarSesion,
  restante as restanteDe,
  saltar,
  sesionNueva,
  type Modo,
  type SesionPomodoro,
} from '@/estudio/pomodoro';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

const TAM = 260;
const GROSOR = 10;
const R = (TAM - GROSOR) / 2;
const CIRC = 2 * Math.PI * R;
const CLAVE = 'pomodoro_sesion';
const CLAVE_AVISO = 'pomodoro_aviso';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Cancela la alarma guardada (si había) y, si la sesión corre, agenda la nueva. */
async function sincronizarAlarma(db: ReturnType<typeof useSQLiteContext>, s: SesionPomodoro | null) {
  if (Platform.OS === 'web') return;
  const previa = await getSetting(db, CLAVE_AVISO);
  if (previa) await Notifications.cancelScheduledNotificationAsync(previa).catch(() => {});
  let nueva = '';
  if (s?.finEn != null && s.finEn > Date.now() + 1000) {
    try {
      nueva = await Notifications.scheduleNotificationAsync({
        content: {
          title: s.fase === 'enfoque' ? '¡Bloque de estudio listo! 🎉' : 'Se acabó el descanso ⏱️',
          body: s.fase === 'enfoque' ? 'Tómate un descanso: estira, toma agua.' : 'Vuelve a Tinzit0 para el siguiente bloque.',
          sound: true,
          data: { tipo: 'pomodoro', ruta: '/pomodoro' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(s.finEn), channelId: 'tinzit0' },
      });
    } catch {
      // sin permiso de notificaciones: el temporizador igual funciona en pantalla
    }
  }
  await setSetting(db, CLAVE_AVISO, nueva);
}

export function PomodoroScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ ramo?: string; auto?: string }>();

  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [sesion, setSesionEstado] = useState<SesionPomodoro | null>(null);
  const [ahora, setAhora] = useState(0);
  const [hoyMin, setHoyMin] = useState(0);
  const sesionRef = useRef<SesionPomodoro | null>(null);
  const arrancado = useRef(false);

  const cargarHoy = useCallback(async () => {
    const h = toISODate();
    setHoyMin((await minutosEstudio(db, h, h)).total);
  }, [db]);

  /** Cambia la sesión: la guarda en la base y ajusta la alarma. */
  const cambiar = useCallback(
    (s: SesionPomodoro) => {
      sesionRef.current = s;
      setSesionEstado(s);
      setAhora(Date.now());
      setSetting(db, CLAVE, JSON.stringify(s))
        .then(() => sincronizarAlarma(db, s))
        .catch(console.warn);
    },
    [db],
  );

  /** Revisa si terminó una fase (también al volver a la app) y registra el bloque una sola vez. */
  const revisar = useCallback(() => {
    const s = sesionRef.current;
    const t = Date.now();
    setAhora(t);
    if (!s) return;
    const r = avanzar(s, t);
    if (!r.cambio) return;
    if (r.terminado) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      registrarBloque(db, r.terminado.id, r.terminado.ramo, r.terminado.minutos).then(cargarHoy).catch(console.warn);
    }
    cambiar(r.sesion);
  }, [db, cambiar, cargarHoy]);

  // Cargar: ramos, minutos de hoy y la sesión guardada (si había una).
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [rs, guardada, pref] = await Promise.all([listarRamosSimple(db), getSetting(db, CLAVE), getSetting(db, 'pomodoro_min')]);
      if (!vivo) return;
      setRamos(rs);
      await cargarHoy();
      const modo: Modo = pref === '50' ? '50' : pref === '15' ? '15' : '25';
      const s = leerSesion(guardada) ?? sesionNueva(modo, params.ramo ? Number(params.ramo) : null);
      sesionRef.current = s;
      setSesionEstado(s);
      revisar();
      // Arranque automático si vienes desde la voz ("modo enfoque"), solo si no había algo corriendo.
      if (params.auto === '1' && !arrancado.current && s.finEn == null) {
        arrancado.current = true;
        const base = s.fase === 'enfoque' && s.restante === duracionFase('enfoque', s.modo) ? s : sesionNueva(s.modo, s.ramo);
        cambiar(iniciarSesion({ ...base, ramo: params.ramo ? Number(params.ramo) : base.ramo }));
      }
    })().catch(console.warn);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // Reloj: una vez por segundo mientras corre, y al volver a la app.
  const corriendo = sesion?.finEn != null;
  useEffect(() => {
    if (!corriendo) return;
    const i = setInterval(revisar, 1000);
    const sub = AppState.addEventListener('change', (e) => e === 'active' && revisar());
    return () => {
      clearInterval(i);
      sub.remove();
    };
  }, [corriendo, revisar]);

  if (!sesion) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const { fase, modo, ramo, ciclos } = sesion;
  const ms = ahora ? restanteDe(sesion, ahora) : sesion.restante;
  const total = duracionFase(fase, modo);
  const progreso = 1 - ms / total;
  const color = fase === 'enfoque' ? colors.accent : colors.warning;
  const ramoSel = ramos.find((r) => r.id === ramo);
  const enBlanco = !corriendo && fase === 'enfoque' && sesion.restante === total;

  const alternar = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    cambiar(corriendo ? pausarSesion(sesion) : iniciarSesion(sesion));
  };

  /** Termina la sesión: guarda lo estudiado (5+ min) y vuelve a cero. */
  const terminar = () => {
    const hechos = minutosHechos(sesion);
    if (hechos) registrarBloque(db, sesion.id, sesion.ramo, hechos).then(cargarHoy).catch(console.warn);
    cambiar(sesionNueva(modo, ramo));
  };

  const elegirRamo = (id: number | null) => cambiar({ ...sesion, ramo: id });
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
        {enBlanco ? (
          <SegmentedControl
            options={[
              { value: '25', label: '25 / 5' },
              { value: '50', label: '50 / 10' },
              { value: '15', label: '15 / 3' },
            ]}
            value={modo}
            onChange={(m) => {
              cambiar(sesionNueva(m, ramo));
              setSetting(db, 'pomodoro_min', m).catch(() => {});
            }}
          />
        ) : (
          <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            {ramoSel ? ramoSel.name : 'Estudio general'} · {ciclos} {ciclos === 1 ? 'bloque' : 'bloques'} en esta sesión
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
          <PressableScale accessibilityRole="button" onPress={terminar} accessibilityLabel="Terminar y guardar lo estudiado" style={[styles.btnChico, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="stop" size={22} color={colors.textSecondary} />
          </PressableScale>
          <PressableScale
              accessibilityRole="button"
            onPress={alternar}
            accessibilityLabel={corriendo ? 'Pausar' : 'Empezar'}
            style={[styles.btnGrande, { backgroundColor: colors.accent }]}
          >
            <Ionicons name={corriendo ? 'pause' : 'play'} size={34} color={colors.onAccent} style={corriendo ? undefined : { marginLeft: 4 }} />
          </PressableScale>
          <PressableScale
              accessibilityRole="button"
            onPress={() => cambiar(saltar(sesion))}
            accessibilityLabel="Saltar a la siguiente fase"
            style={[styles.btnChico, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="play-skip-forward" size={22} color={colors.textSecondary} />
          </PressableScale>
        </View>

        {/* Ramo */}
        {ramos.length ? (
          <View style={styles.wrap}>
            <Chip compact label="General" selected={ramo == null} onPress={() => elegirRamo(null)} />
            {ramos.map((r) => (
              <Chip key={r.id} compact label={r.name} selected={ramo === r.id} onPress={() => elegirRamo(r.id)} leading={<View style={[styles.punto, { backgroundColor: r.color }]} />} />
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
