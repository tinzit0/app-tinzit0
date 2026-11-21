/**
 * Tinzit0, tu asistente estilo Jarvis: interfaz holográfica a pantalla completa.
 * Si no entiende algo, te ofrece opciones y APRENDE la que elijas.
 *
 * - Toca el reactor (o di "Jarvis" / "ey Tinzit0" si lo activaste) y habla.
 * - El reactor muestra el estado: en espera, escuchando, procesando, respondiendo.
 * - Modo conversación: después de responder vuelve a escuchar solo, hasta que digas
 *   "eso es todo" o "gracias".
 * - Paneles HUD con los datos de lo que preguntaste (tareas, gastos, clima…).
 * - Puedes cambiarle el color por voz: "ponte rojo", "haz un escaneo".
 * - También puedes escribir (sirve en Expo Go, donde no hay reconocimiento de voz).
 * Todo es gratis: funciona en el celular, sin servicios de pago.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { obtenerClima } from '@/clima/clima';
import { AppText } from '@/components/AppText';
import { useLogros } from '@/components/LogrosProvider';
import { getSetting, setSetting } from '@/database/queries';
import { Boot, debeArrancar } from '@/jarvis/Boot';
import { colorHud, HUD } from '@/jarvis/colores';
import { PanelHud } from '@/jarvis/PanelHud';
import type { Panel } from '@/jarvis/paneles';
import { aplicarEstilo, type Estilo } from '@/jarvis/persona';
import { Reactor, type EstadoReactor } from '@/jarvis/Reactor';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import type { Sugerencia } from '@/voice/aprender';
import { iaActivada, liberarIA, preguntarIA } from '@/ia/modelo';
import { ejecutarAccion } from '@/voice/acciones';
import { guardarMensaje, mensajesDeHoy, responder, type MensajeChat } from '@/voice/ejecutar';
import { callar, configurarVoz, hablar } from '@/voice/hablar';
import type { TipoIntencion } from '@/voice/interpretar';
import { escuchar, pedirPermisoMicrofono, vozDisponible, type Escucha } from '@/voice/reconocedor';
import { useVoz } from '@/voice/VozProvider';

const SUGERENCIAS = ['¿Cómo voy hoy?', '¿Va a llover mañana?', '¿Cómo me fue este mes?', 'Estado del sistema', '¿Qué puedes hacer?'];

const ETIQUETA: Record<EstadoReactor, string> = {
  reposo: 'EN ESPERA',
  escuchando: 'ESCUCHANDO',
  pensando: 'PROCESANDO',
  hablando: 'RESPONDIENDO',
};

function hora() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AsistenteScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { revisar } = useLogros();
  const { pausarActivacion } = useVoz();
  const params = useLocalSearchParams<{ auto?: string; comando?: string }>();
  const { setPreference } = useTheme();
  const vieneDeVoz = params.auto === '1' || !!params.comando;

  // Preferencias
  const [color, setColor] = useState(colorHud(null));
  const [estilo, setEstilo] = useState<Estilo>('jarvis');
  const [trato, setTrato] = useState('señor');
  const [conversacion, setConversacion] = useState(true);
  const prefs = useRef({ voz: true, estilo: 'jarvis' as Estilo, trato: 'señor', conversacion: true });

  // Estado de la pantalla
  const [boot, setBoot] = useState(() => !vieneDeVoz && debeArrancar());
  const [estado, setEstado] = useState<EstadoReactor>('reposo');
  const [parcial, setParcial] = useState('');
  const [ultimaPregunta, setUltimaPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [panel, setPanel] = useState<Panel | undefined>();
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const duda = useRef<{ sugerencias: Sugerencia[]; pendiente: string } | null>(null);
  const [efecto, setEfecto] = useState<{ tipo: 'scan' | 'pulse'; id: number } | null>(null);
  const [teclado, setTeclado] = useState(!vozDisponible);
  const [texto, setTexto] = useState('');
  const [historial, setHistorial] = useState<MensajeChat[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [estadoSys, setEstadoSys] = useState({ hora: hora(), temp: null as number | null, bateria: null as number | null });

  const volumen = useSharedValue(0);
  const escucha = useRef<Escucha | null>(null);
  const ultimo = useRef<TipoIntencion | null>(null);
  const montado = useRef(true);
  const bateria = useRef<number | null>(null);

  // Cargar preferencias, historial y datos del sistema
  useEffect(() => {
    montado.current = true;
    pausarActivacion(true);
    (async () => {
      const [c, e, t, conv, vozResp, vozId, nombre] = await Promise.all([
        getSetting(db, 'hud_color'),
        getSetting(db, 'asistente_estilo'),
        getSetting(db, 'asistente_trato'),
        getSetting(db, 'jarvis_conversacion'),
        getSetting(db, 'voz_respuesta'),
        getSetting(db, 'voz_id'),
        getSetting(db, 'nombre'),
      ]);
      const est: Estilo = e === 'cercano' ? 'cercano' : 'jarvis';
      const tr = t?.trim() || (nombre?.trim() ? nombre.trim() : 'señor');
      prefs.current = { voz: vozResp !== '0', estilo: est, trato: tr, conversacion: conv !== '0' };
      setColor(colorHud(c));
      setEstilo(est);
      setTrato(tr);
      setConversacion(conv !== '0');
      configurarVoz({ vozId: vozId || null, estilo: est });
      setHistorial(await mensajesDeHoy(db));
    })().catch(console.warn);

    Battery.getBatteryLevelAsync()
      .then((b) => {
        bateria.current = b >= 0 ? b : null;
        setEstadoSys((s) => ({ ...s, bateria: bateria.current }));
      })
      .catch(() => {});
    obtenerClima(db)
      .then((p) => p && setEstadoSys((s) => ({ ...s, temp: p.actual.temp })))
      .catch(() => {});
    const reloj = setInterval(() => setEstadoSys((s) => ({ ...s, hora: hora() })), 15_000);

    return () => {
      montado.current = false;
      clearInterval(reloj);
      pausarActivacion(false);
      escucha.current?.cancelar();
      callar();
      liberarIA(); // libera la memoria del modelo de IA al salir
    };
  }, [db, pausarActivacion]);

  // ---------- Escuchar ----------
  const empezar = useCallback(async () => {
    if (!vozDisponible) {
      setTeclado(true);
      return;
    }
    if (!(await pedirPermisoMicrofono())) return;
    callar();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setParcial('');
    setEstado('escuchando');
    escucha.current = escuchar({
      onParcial: setParcial,
      onFinal: (t) => {
        volumen.set(withTiming(0, { duration: 150 }));
        setParcial('');
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        procesarRef.current(t).catch(console.warn);
      },
      onVolumen: (v) => volumen.set(withTiming(Math.max(0, Math.min(1, (v + 2) / 12)), { duration: 110 })),
      onError: (codigo) => {
        if (codigo === 'no-speech' || codigo === 'speech-timeout') setEstado('reposo');
      },
      onFin: () => {
        volumen.set(withTiming(0, { duration: 150 }));
        escucha.current = null;
        setEstado((e) => (e === 'escuchando' ? 'reposo' : e));
      },
    });
  }, [volumen]);

  // ---------- Procesar una frase ----------
  const procesar = useCallback(
    async (frase: string) => {
      const limpio = frase.trim();
      if (!limpio) {
        setEstado('reposo');
        return;
      }
      setUltimaPregunta(limpio);
      setEstado('pensando');
      await guardarMensaje(db, 'user', limpio);

      let base = await responder(
        db,
        limpio,
        { ultimo: ultimo.current, sugerencias: duda.current?.sugerencias, pendiente: duda.current?.pendiente },
        { bateria: bateria.current },
      );
      // 3ª capa: si las reglas no entendieron (o solo tienen opciones dudosas) y la IA está
      // descargada, le preguntamos a ella. Si responde, no hace falta el "¿Quisiste decir…?".
      if (base.intencion === 'desconocido' && (await iaActivada(db))) {
        try {
          base = await preguntarIA(db, limpio, (c) => responder(db, c, {}, { bateria: bateria.current }));
        } catch (e) {
          console.warn('IA no respondió', e);
        }
      }
      // Si no entendió, guardamos las opciones para la próxima frase ("la primera").
      duda.current = base.sugerencias?.length && base.pendiente ? { sugerencias: base.sugerencias, pendiente: base.pendiente } : null;
      const r = aplicarEstilo(base, prefs.current.estilo, prefs.current.trato);
      ultimo.current = r.intencion ?? null;

      await guardarMensaje(db, 'bot', r.texto);
      if (!montado.current) return;
      setRespuesta(r.texto);
      setPanel(r.panel);
      setSugerencias(r.sugerencias ?? []);
      setHistorial(await mensajesDeHoy(db));

      // Cambios de la interfaz pedidos por voz
      if (r.hud?.color) {
        setColor(colorHud(r.hud.color));
        setSetting(db, 'hud_color', r.hud.color).catch(() => {});
        setEfecto({ tipo: 'pulse', id: Date.now() });
      }
      if (r.hud?.efecto) setEfecto({ tipo: r.hud.efecto, id: Date.now() });
      if (r.accion) ejecutarAccion(r.accion, router, { setTema: setPreference }).catch(console.warn);
      revisar(true);

      // Hablar y, en modo conversación, volver a escuchar
      if (prefs.current.voz && Platform.OS !== 'web') {
        setEstado('hablando');
        await hablar(r.texto);
      }
      if (!montado.current) return;
      const seguir = prefs.current.conversacion && !r.fin && !r.accion && vozDisponible && r.intencion !== 'gracias';
      setEstado('reposo');
      // Pausa breve: así el micrófono no capta el final de su propia voz.
      if (seguir) setTimeout(() => montado.current && empezar().catch(console.warn), 450);
    },
    [db, empezar, revisar, router, setPreference],
  );
  const procesarRef = useRef(procesar);
  useEffect(() => {
    procesarRef.current = procesar;
  }, [procesar]);

  // Tocar el reactor: escuchar / terminar de hablar / interrumpir la respuesta
  const tocarReactor = () => {
    if (estado === 'escuchando') {
      escucha.current?.detener();
      return;
    }
    if (estado === 'hablando') {
      callar();
      empezar().catch(console.warn);
      return;
    }
    if (estado === 'reposo') empezar().catch(console.warn);
  };

  const cancelar = () => {
    escucha.current?.cancelar();
    escucha.current = null;
    callar();
    setEstado('reposo');
    setParcial('');
    Haptics.selectionAsync().catch(() => {});
  };

  const alternarConversacion = () => {
    const v = !conversacion;
    setConversacion(v);
    prefs.current.conversacion = v;
    setSetting(db, 'jarvis_conversacion', v ? '1' : '0').catch(() => {});
    Haptics.selectionAsync().catch(() => {});
  };

  // Al terminar el arranque (o si vienes por voz): saludo o comando
  const arrancado = useRef(false);
  useEffect(() => {
    if (boot || arrancado.current) return;
    arrancado.current = true;
    if (params.comando) {
      procesar(params.comando).catch(console.warn);
    } else if (params.auto === '1') {
      empezar().catch(console.warn);
    } else {
      const t = setTimeout(() => {
        const saludo = aplicarEstilo({ texto: '¿En qué te ayudo?', intencion: 'saludo' }, prefs.current.estilo, prefs.current.trato).texto;
        setRespuesta(saludo);
        if (prefs.current.voz && Platform.OS !== 'web') {
          setEstado('hablando');
          hablar(saludo).finally(() => montado.current && setEstado('reposo'));
        }
      }, 250);
      return () => clearTimeout(t);
    }
  }, [boot, params.comando, params.auto, procesar, empezar]);

  const enviar = () => {
    const t = texto;
    setTexto('');
    procesar(t).catch(console.warn);
  };

  const tamReactor = Math.min(width * 0.68, 280);

  return (
    <View style={[styles.flex, { backgroundColor: HUD.fondo }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* Barra superior */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="chevron-back" size={24} color={HUD.texto} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <AppText style={[styles.marca, { color }]}>TINZIT0</AppText>
          <AppText style={styles.sub}>{estilo === 'jarvis' ? 'ASISTENTE PERSONAL · EN LÍNEA' : 'EN LÍNEA'}</AppText>
        </View>
        <View style={styles.sys}>
          <AppText style={styles.sysTxt}>{estadoSys.hora}</AppText>
          {estadoSys.temp != null ? <AppText style={styles.sysTxt}>{estadoSys.temp}°</AppText> : null}
          {estadoSys.bateria != null ? (
            <View style={styles.bat}>
              <Ionicons name={estadoSys.bateria > 0.5 ? 'battery-full' : estadoSys.bateria > 0.2 ? 'battery-half' : 'battery-dead'} size={16} color={estadoSys.bateria < 0.2 ? '#FF6B6B' : HUD.tenue} />
              <AppText style={styles.sysTxt}>{Math.round(estadoSys.bateria * 100)}%</AppText>
            </View>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.centro} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Reactor */}
          <Pressable onPress={tocarReactor} accessibilityRole="button" accessibilityLabel={estado === 'escuchando' ? 'Terminar de hablar' : 'Hablar con el asistente'}>
            <Reactor estado={estado} color={color} volumen={volumen} efecto={efecto} size={tamReactor} />
          </Pressable>
          <AppText style={[styles.estado, { color }]}>{ETIQUETA[estado]}</AppText>

          {/* Transcripción */}
          <View style={styles.transcripcion}>
            {estado === 'escuchando' ? (
              <AppText style={styles.pregunta}>{parcial ? `“${parcial}”` : 'Te escucho…'}</AppText>
            ) : ultimaPregunta ? (
              <AppText style={styles.pregunta} numberOfLines={2}>{`“${ultimaPregunta}”`}</AppText>
            ) : null}
            {respuesta && estado !== 'escuchando' ? (
              <Animated.View key={respuesta} entering={FadeIn.duration(220)}>
                <AppText style={styles.respuesta}>{respuesta}</AppText>
              </Animated.View>
            ) : null}
          </View>

          {/* ¿Quisiste decir…? → tocar una opción enseña a Tinzit0 */}
          {sugerencias.length && estado !== 'escuchando' ? (
            <View style={styles.sugerencias}>
              {sugerencias.map((s, k) => (
                <Pressable
                  key={s.comando}
                  onPress={() => procesar(['la primera', 'la segunda', 'la tercera'][k])}
                  style={[styles.chip, { borderColor: color, backgroundColor: `${color}14` }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Quise decir: ${s.etiqueta}`}
                >
                  <AppText style={styles.chipTxt}>{`${k + 1}. ${s.etiqueta}`}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Panel con datos */}
          {panel && estado !== 'escuchando' ? (
            <View style={styles.panel}>
              <PanelHud key={JSON.stringify(panel).length + (respuesta ?? '')} panel={panel} color={color} />
            </View>
          ) : null}

          {/* Sugerencias al inicio */}
          {!ultimaPregunta && estado === 'reposo' ? (
            <View style={styles.sugerencias}>
              {SUGERENCIAS.map((s) => (
                <Pressable key={s} onPress={() => procesar(s)} style={[styles.chip, { borderColor: `${color}55` }]} accessibilityRole="button">
                  <AppText style={styles.chipTxt}>{s}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        {/* Barra inferior */}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
          {teclado ? (
            <View style={[styles.input, { borderColor: `${color}55` }]}>
              <TextInput
                value={texto}
                onChangeText={setTexto}
                onSubmitEditing={enviar}
                autoFocus={!vozDisponible ? false : true}
                placeholder="Escribe una instrucción…"
                placeholderTextColor={HUD.muyTenue}
                returnKeyType="send"
                accessibilityLabel="Instrucción para el asistente"
                style={styles.inputTxt}
              />
              <Pressable onPress={enviar} disabled={!texto.trim()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Enviar">
                <Ionicons name="arrow-up-circle" size={30} color={texto.trim() ? color : HUD.muyTenue} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.botones}>
            <BotonHud icono="list" label="Historial" onPress={() => setVerHistorial(true)} />
            <BotonHud icono={teclado ? 'mic-outline' : 'keypad-outline'} label={teclado ? 'Voz' : 'Teclado'} onPress={() => setTeclado((v) => !v)} />
            {estado === 'escuchando' || estado === 'hablando' ? (
              <BotonHud icono="stop" label="Detener" onPress={cancelar} activo color={color} />
            ) : (
              <BotonHud icono="mic" label="Hablar" onPress={() => empezar()} activo color={color} />
            )}
            <BotonHud icono="infinite" label={conversacion ? 'Conversación' : 'Una vez'} onPress={alternarConversacion} encendido={conversacion} color={color} />
            <BotonHud icono="settings-outline" label="Ajustes" onPress={() => router.push('/ajustes')} />
          </View>
          {!vozDisponible ? <AppText style={styles.aviso}>La voz funciona en la app instalada. Aquí puedes escribir.</AppText> : null}
        </View>
      </KeyboardAvoidingView>

      {/* Historial de hoy */}
      <Modal visible={verHistorial} animationType="slide" transparent onRequestClose={() => setVerHistorial(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.modalTop}>
            <AppText style={[styles.marca, { color }]}>REGISTRO DE HOY</AppText>
            <Pressable onPress={() => setVerHistorial(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={24} color={HUD.texto} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, padding: 20 }}>
            {historial.length === 0 ? <AppText style={styles.pregunta}>Sin registros todavía.</AppText> : null}
            {historial.map((m) => (
              <View key={m.id} style={[styles.msg, m.role === 'user' ? styles.msgUser : { borderColor: `${color}40` }]}>
                <AppText style={[styles.msgRol, { color: m.role === 'user' ? HUD.muyTenue : color }]}>{m.role === 'user' ? 'TÚ' : 'TINZIT0'} · {m.created_at.slice(11, 16)}</AppText>
                <AppText style={styles.msgTxt}>{m.text}</AppText>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {boot ? <Boot color={color} onFin={() => setBoot(false)} /> : null}
    </View>
  );
}

function BotonHud({
  icono,
  label,
  onPress,
  activo,
  encendido,
  color = HUD.texto,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  activo?: boolean;
  encendido?: boolean;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={styles.boton}>
      <View
        style={[
          activo ? styles.botonGrande : styles.botonChico,
          activo ? { backgroundColor: color } : { borderColor: encendido ? color : 'rgba(232,246,255,0.18)' },
        ]}
      >
        <Ionicons name={icono} size={activo ? 28 : 20} color={activo ? HUD.fondo : encendido ? color : HUD.texto} />
      </View>
      <AppText style={[styles.botonTxt, encendido && { color }]}>{label.toUpperCase()}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  marca: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 3 },
  sub: { fontFamily: fonts.medium, fontSize: 9.5, letterSpacing: 2, color: HUD.muyTenue },
  sys: { alignItems: 'flex-end', gap: 2 },
  sysTxt: { fontFamily: fonts.medium, fontSize: 11, color: HUD.tenue, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  bat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  centro: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  estado: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 4, marginTop: 6 },
  transcripcion: { alignSelf: 'stretch', marginTop: 16, gap: 10, minHeight: 60 },
  pregunta: { fontFamily: fonts.medium, fontSize: 14, color: HUD.tenue, textAlign: 'center' },
  respuesta: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 26, color: HUD.texto, textAlign: 'center', letterSpacing: -0.1 },
  panel: { alignSelf: 'stretch', marginTop: 18 },
  sugerencias: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipTxt: { fontFamily: fonts.medium, fontSize: 13, color: HUD.texto },
  bottom: { paddingHorizontal: 16, paddingTop: 10, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(232,246,255,0.08)' },
  input: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingLeft: 16, paddingRight: 6, minHeight: 48 },
  inputTxt: { flex: 1, color: HUD.texto, fontFamily: fonts.regular, fontSize: 16, paddingVertical: 8 },
  botones: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  boton: { alignItems: 'center', gap: 6, minWidth: 56 },
  botonChico: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  botonGrande: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  botonTxt: { fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 1.2, color: HUD.muyTenue },
  aviso: { fontFamily: fonts.medium, fontSize: 11, color: HUD.muyTenue, textAlign: 'center' },
  modal: { flex: 1, backgroundColor: 'rgba(3,7,11,0.97)' },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  msg: { borderWidth: 1, borderRadius: 4, padding: 12, gap: 4 },
  msgUser: { borderColor: 'rgba(232,246,255,0.12)', backgroundColor: 'rgba(232,246,255,0.03)' },
  msgRol: { fontFamily: fonts.semibold, fontSize: 9.5, letterSpacing: 1.6 },
  msgTxt: { fontFamily: fonts.regular, fontSize: 14, color: HUD.texto, lineHeight: 20 },
});
