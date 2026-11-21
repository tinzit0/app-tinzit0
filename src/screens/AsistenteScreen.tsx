/**
 * Asistente de Tinzit0: chat con burbujas + micrófono.
 * - Toca el micrófono (o di "ey Tinzit0" si lo activaste) y habla.
 * - También puedes escribir (sirve en Expo Go, donde no hay reconocimiento de voz).
 * - Responde con texto y con voz. El historial del día queda guardado.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { useLogros } from '@/components/LogrosProvider';
import { MicOrb } from '@/components/MicOrb';
import { getSetting } from '@/database/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { guardarMensaje, mensajesDeHoy, responder, type MensajeChat } from '@/voice/ejecutar';
import { callar, hablar } from '@/voice/hablar';
import { EJEMPLOS } from '@/voice/interpretar';
import { escuchar, pedirPermisoMicrofono, vozDisponible, type Escucha } from '@/voice/reconocedor';
import { useVoz } from '@/voice/VozProvider';

type Burbuja = MensajeChat & { ruta?: string };

const NOMBRES_RUTA: Record<string, string> = {
  '/tareas': 'Ver tareas',
  '/gastos': 'Ver gastos',
  '/gym': 'Ver gym',
  '/habitos': 'Ver hábitos',
  '/metas': 'Ver metas',
  '/cuerpo': 'Ver peso',
  '/ajustes': 'Abrir ajustes',
};

export function AsistenteScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { revisar } = useLogros();
  const { pausarActivacion } = useVoz();
  const params = useLocalSearchParams<{ auto?: string; comando?: string }>();

  const [mensajes, setMensajes] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState('');
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [pensando, setPensando] = useState(false);
  const volumen = useSharedValue(0);
  const escucha = useRef<Escucha | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const vozOn = useRef(true);

  // Mientras el asistente está abierto, no escuchamos "ey Tinzit0" de fondo.
  useEffect(() => {
    pausarActivacion(true);
    getSetting(db, 'voz_respuesta').then((v) => (vozOn.current = v !== '0'));
    mensajesDeHoy(db).then(setMensajes).catch(console.warn);
    return () => {
      pausarActivacion(false);
      escucha.current?.cancelar();
      callar();
    };
  }, [db, pausarActivacion]);

  const procesar = useCallback(
    async (frase: string) => {
      const limpio = frase.trim();
      if (!limpio) return;
      const ahora = new Date().toISOString();
      setMensajes((m) => [...m, { id: Date.now(), role: 'user', text: limpio, created_at: ahora }]);
      setPensando(true);
      try {
        await guardarMensaje(db, 'user', limpio);
        const r = await responder(db, limpio);
        await guardarMensaje(db, 'bot', r.texto);
        setMensajes((m) => [...m, { id: Date.now() + 1, role: 'bot', text: r.texto, created_at: ahora, ruta: r.ruta }]);
        if (vozOn.current && Platform.OS !== 'web') hablar(r.texto).catch(() => {});
        revisar();
      } finally {
        setPensando(false);
      }
    },
    [db, revisar],
  );

  const empezar = useCallback(async () => {
    if (!vozDisponible) return;
    if (!(await pedirPermisoMicrofono())) return;
    callar();
    // Aviso de que empezó a escuchar: vibración corta.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setParcial('');
    setEscuchando(true);
    escucha.current = escuchar({
      onParcial: setParcial,
      onFinal: (t) => {
        setEscuchando(false);
        setParcial('');
        volumen.set(withTiming(0, { duration: 150 }));
        procesar(t).catch(console.warn);
      },
      onVolumen: (v) => volumen.set(withTiming(Math.max(0, Math.min(1, (v + 2) / 12)), { duration: 110 })),
      onError: (codigo) => {
        if (codigo === 'no-speech' || codigo === 'speech-timeout') {
          setMensajes((m) => [
            ...m,
            { id: Date.now(), role: 'bot', text: 'No te escuché bien 🙉 Toca el micrófono e inténtalo de nuevo.', created_at: '' },
          ]);
        }
      },
      onFin: () => {
        setEscuchando(false);
        volumen.set(withTiming(0, { duration: 150 }));
        escucha.current = null;
      },
    });
  }, [procesar, volumen]);

  const cancelar = () => {
    escucha.current?.cancelar();
    escucha.current = null;
    setEscuchando(false);
    setParcial('');
    Haptics.selectionAsync().catch(() => {});
  };

  // Si llegamos por "ey Tinzit0": responder el comando o empezar a escuchar.
  const arrancado = useRef(false);
  useEffect(() => {
    if (arrancado.current) return;
    arrancado.current = true;
    if (params.comando) procesar(params.comando).catch(console.warn);
    else if (params.auto === '1') empezar().catch(console.warn);
  }, [params.comando, params.auto, procesar, empezar]);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  }, [mensajes.length, pensando]);

  const enviar = () => {
    const t = texto;
    setTexto('');
    procesar(t).catch(console.warn);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Tinzit0' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView ref={scroll} contentContainerStyle={styles.chat} keyboardShouldPersistTaps="handled">
          {mensajes.length === 0 ? (
            <View style={styles.vacio}>
              <AppText variant="title" style={{ textAlign: 'center' }}>¿En qué te ayudo?</AppText>
              <AppText variant="callout" tone="secondary" style={{ textAlign: 'center', marginBottom: space.lg }}>
                {vozDisponible ? 'Toca el micrófono y habla, o escríbeme.' : 'Escríbeme lo que necesites.'}
              </AppText>
              <View style={styles.sugerencias}>
                {EJEMPLOS.map((e) => (
                  <Chip key={e} compact label={e} onPress={() => procesar(e)} />
                ))}
              </View>
            </View>
          ) : (
            mensajes.map((m) => (
              <Animated.View
                key={m.id}
                entering={FadeInDown.duration(220)}
                style={[
                  styles.burbuja,
                  m.role === 'user'
                    ? [styles.user, { backgroundColor: colors.accent }]
                    : [styles.bot, { backgroundColor: colors.surface, borderColor: colors.border }],
                ]}
              >
                <AppText variant="callout" style={{ color: m.role === 'user' ? colors.onAccent : colors.text }}>
                  {m.text}
                </AppText>
                {m.ruta && NOMBRES_RUTA[m.ruta] ? (
                  <Pressable onPress={() => router.push(m.ruta as never)} hitSlop={8} accessibilityRole="link" style={{ marginTop: space.sm }}>
                    <AppText variant="caption" tone="accent">{NOMBRES_RUTA[m.ruta]} →</AppText>
                  </Pressable>
                ) : null}
              </Animated.View>
            ))
          )}
          {pensando ? (
            <View style={[styles.burbuja, styles.bot, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppText variant="callout" tone="tertiary">…</AppText>
            </View>
          ) : null}
        </ScrollView>

        {/* Zona inferior: escuchando o escribiendo */}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.md, borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          {escuchando ? (
            <View style={styles.escuchando}>
              <AppText variant="overline" tone="accent">Escuchando…</AppText>
              <AppText variant="headline" style={{ textAlign: 'center', minHeight: 24 }} numberOfLines={3}>
                {parcial || ' '}
              </AppText>
              <MicOrb escuchando volumen={volumen} onPress={() => escucha.current?.detener()} accessibilityLabel="Terminar de hablar" />
              <Pressable onPress={cancelar} hitSlop={10} accessibilityRole="button" style={styles.cancelar}>
                <AppText variant="callout" tone="secondary">Cancelar</AppText>
              </Pressable>
            </View>
          ) : (
            <>
              {vozDisponible ? (
                <View style={{ alignItems: 'center', marginTop: -space.md }}>
                  <MicOrb escuchando={false} volumen={volumen} onPress={empezar} size={64} accessibilityLabel="Hablar con Tinzit0" />
                </View>
              ) : (
                <AppText variant="caption" tone="tertiary" style={{ textAlign: 'center', marginBottom: space.sm }}>
                  La voz funciona en el development build. Aquí puedes escribir.
                </AppText>
              )}
              <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  value={texto}
                  onChangeText={setTexto}
                  onSubmitEditing={enviar}
                  placeholder="Escríbele a Tinzit0…"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="send"
                  style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.sm }]}
                  accessibilityLabel="Mensaje para Tinzit0"
                />
                <Pressable
                  onPress={enviar}
                  disabled={!texto.trim()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar"
                  style={[styles.send, { backgroundColor: texto.trim() ? colors.accent : colors.surfaceRaised }]}
                >
                  <Ionicons name="arrow-up" size={18} color={texto.trim() ? colors.onAccent : colors.textTertiary} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  chat: { padding: space.xl, gap: space.sm, flexGrow: 1 },
  vacio: { flex: 1, justifyContent: 'center', gap: space.sm, paddingVertical: space.xxxl },
  sugerencias: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  burbuja: { maxWidth: '86%', borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
  user: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  bot: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 6 },
  bottom: { borderTopWidth: 1, paddingHorizontal: space.lg, paddingTop: space.md },
  escuchando: { alignItems: 'center', gap: space.xs },
  cancelar: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.lg },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingLeft: space.lg,
    paddingRight: 6,
    minHeight: 50,
  },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
