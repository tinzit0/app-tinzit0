/**
 * Grabar una clase y pasarla a texto mientras el profe habla (dictado de Android, gratis).
 * Al terminar: resumen (con la IA del celular si está, o automático), guardar como nota
 * y crear tarjetas de estudio.
 *
 * Detalles:
 * - Android corta el dictado cada cierto rato: lo reiniciamos solo, sin perder lo anterior.
 * - La pantalla queda encendida mientras graba (si se apaga, Android detiene el micrófono).
 * - Se pausa el "ey Tinzit0" para que no compitan por el micrófono.
 * - IMPORTANTE: es una TRANSCRIPCIÓN (texto). El audio no se graba ni se guarda.
 * - Borrador: lo transcrito se guarda solo cada pocos segundos y al salir/cerrar la app.
 *   Si la app se cierra, al volver te ofrece recuperarlo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { PressableScale } from '@/components/PressableScale';
import { crearTarjetas, listarRamosSimple, type Ramo } from '@/database/estudio';
import { guardarNota } from '@/database/notas';
import { getSetting, setSetting } from '@/database/queries';
import { resumenConIA, tarjetasConIA } from '@/estudio/conIA';
import { palabrasClave } from '@/estudio/logica';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { fechaLarga } from '@/utils/fechas';
import { escuchar, pedirPermisoMicrofono, vozDisponible, type Escucha } from '@/voice/reconocedor';
import { useVoz } from '@/voice/VozProvider';

const CLAVE_BORRADOR = 'borrador_clase';
type Borrador = { texto: string; segundos: number; ramo: number | null; fecha: string };

const reloj = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function GrabarClaseScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { pausarActivacion } = useVoz();

  const [ramos, setRamos] = useState<Ramo[]>([]);
  const [ramo, setRamo] = useState<number | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [texto, setTexto] = useState('');
  const [parcial, setParcial] = useState('');
  const [segundos, setSegundos] = useState(0);
  const [resumen, setResumen] = useState<string[] | null>(null);
  const [ocupado, setOcupado] = useState<'resumen' | 'tarjetas' | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const notaId = useRef<number | null>(null); // al guardar dos veces, se actualiza la misma nota
  const estadoRef = useRef({ texto: '', segundos: 0, ramo: null as number | null });
  useEffect(() => {
    estadoRef.current = { texto, segundos, ramo };
  }, [texto, segundos, ramo]);

  const grabandoRef = useRef(false);
  const escucha = useRef<Escucha | null>(null);
  const ultimo = useRef('');
  const inicio = useRef(0);
  const acumulado = useRef(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    listarRamosSimple(db).then(setRamos).catch(console.warn);
    // ¿Quedó una transcripción sin guardar la vez pasada?
    getSetting(db, CLAVE_BORRADOR)
      .then((raw) => {
        if (!raw) return;
        const b = JSON.parse(raw) as Borrador;
        if (b?.texto?.trim()) setBorrador(b);
      })
      .catch(() => {});
  }, [db]);

  // Guardar el borrador (cada 5 s mientras cambia, y al salir o mandar la app al fondo).
  const guardarBorrador = useRef(async () => {
    const e = estadoRef.current;
    if (!e.texto.trim()) return;
    const b: Borrador = { texto: e.texto, segundos: e.segundos, ramo: e.ramo, fecha: new Date().toISOString() };
    await setSetting(db, CLAVE_BORRADOR, JSON.stringify(b));
  });
  useEffect(() => {
    if (!texto.trim()) return;
    const t = setTimeout(() => {
      guardarBorrador.current().catch(console.warn);
    }, 5000);
    return () => clearTimeout(t);
  }, [texto]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => {
      if (e !== 'active') guardarBorrador.current().catch(console.warn);
    });
    return () => sub.remove();
  }, []);

  const recuperarBorrador = () => {
    if (!borrador) return;
    setTexto(borrador.texto);
    setSegundos(borrador.segundos);
    acumulado.current = borrador.segundos;
    if (borrador.ramo) setRamo(borrador.ramo);
    setBorrador(null);
  };
  const descartarBorrador = () => {
    setBorrador(null);
    setSetting(db, CLAVE_BORRADOR, '').catch(console.warn);
  };

  // Reloj de la grabación
  useEffect(() => {
    if (!grabando) return;
    const i = setInterval(() => setSegundos(acumulado.current + Math.floor((Date.now() - inicio.current) / 1000)), 1000);
    return () => clearInterval(i);
  }, [grabando]);

  // Al salir de la pantalla: guardar el borrador y cortar todo
  useEffect(
    () => () => {
      guardarBorrador.current().catch(console.warn);
      grabandoRef.current = false;
      escucha.current?.cancelar();
      deactivateKeepAwake('grabar');
      pausarActivacion(false);
    },
    [pausarActivacion],
  );

  const agregar = (frase: string) => {
    const f = frase.trim();
    if (!f || f === ultimo.current) return;
    ultimo.current = f;
    setTexto((t) => {
      const conMayus = f.charAt(0).toUpperCase() + f.slice(1);
      return t ? `${t} ${conMayus}${/[.!?]$/.test(f) ? '' : '.'}` : `${conMayus}${/[.!?]$/.test(f) ? '' : '.'}`;
    });
    setParcial('');
    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: false }));
  };

  const bucle = () => {
    if (!grabandoRef.current) return;
    escucha.current = escuchar({
      continuo: true,
      onParcial: setParcial,
      onFinal: agregar,
      onError: (codigo) => {
        if (codigo === 'not-allowed' || codigo === 'service-not-allowed') {
          grabandoRef.current = false;
          setGrabando(false);
          Alert.alert('Sin micrófono', 'Activa el permiso de micrófono para Tinzit0 en Ajustes del celular.');
        }
      },
      // Android cortó: volvemos a escuchar al tiro.
      onFin: () => {
        escucha.current = null;
        if (grabandoRef.current) setTimeout(bucle, 200);
      },
    });
  };

  const empezar = async () => {
    if (!vozDisponible) {
      Alert.alert('No disponible', 'La grabación de clases funciona en la app instalada (APK), no en Expo Go.');
      return;
    }
    if (!(await pedirPermisoMicrofono())) return;
    pausarActivacion(true);
    activateKeepAwakeAsync('grabar').catch(() => {});
    grabandoRef.current = true;
    inicio.current = Date.now();
    setGrabando(true);
    setResumen(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    bucle();
  };

  const detener = () => {
    grabandoRef.current = false;
    acumulado.current += Math.floor((Date.now() - inicio.current) / 1000);
    escucha.current?.detener();
    setGrabando(false);
    if (parcial.trim()) agregar(parcial);
    deactivateKeepAwake('grabar');
    pausarActivacion(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const nombreRamo = ramos.find((r) => r.id === ramo)?.name;

  const resumir = async () => {
    setOcupado('resumen');
    try {
      const r = await resumenConIA(db, texto);
      setResumen(r.puntos);
    } finally {
      setOcupado(null);
    }
  };

  const guardar = async () => {
    const claves = palabrasClave(texto, 3);
    const titulo = `📚 Clase${nombreRamo ? ` de ${nombreRamo}` : ''} · ${fechaLarga()}${claves.length ? ` (${claves.join(', ')})` : ''}`;
    const cuerpo = [titulo, resumen?.length ? `\nResumen:\n${resumen.map((p) => `- ${p}`).join('\n')}` : '', `\nTranscripción (${reloj(segundos)}):\n${texto}`].join('\n');
    try {
      notaId.current = await guardarNota(db, notaId.current, cuerpo);
      await setSetting(db, CLAVE_BORRADOR, ''); // ya quedó en Notas
    } catch {
      Alert.alert('No se pudo guardar', 'Tu transcripción sigue aquí (y como borrador). Inténtalo de nuevo.');
      return;
    }
    Alert.alert('Guardada en Notas ✓', 'La encuentras en la pestaña Notas.', [
      { text: 'Seguir aquí', style: 'cancel' },
      { text: 'Ver notas', onPress: () => router.navigate('/notas') },
    ]);
  };

  const tarjetas = async () => {
    setOcupado('tarjetas');
    try {
      const fuente = resumen?.length ? `${resumen.join('\n')}\n${texto}` : texto;
      const { tarjetas: t, conIA } = await tarjetasConIA(db, fuente);
      if (!t.length) {
        Alert.alert('Sin tarjetas', 'No encontré definiciones claras. Descarga la IA en Ajustes para que las arme sola, o créalas a mano en Tarjetas.');
        return;
      }
      await crearTarjetas(db, ramo, t);
      Alert.alert(`${t.length} tarjetas creadas`, conIA ? 'La IA armó preguntas con lo importante de la clase.' : 'Las armé con las definiciones de la clase.', [
        { text: 'OK', style: 'cancel' },
        { text: 'Repasar', onPress: () => router.push('/tarjetas') },
      ]);
    } finally {
      setOcupado(null);
    }
  };

  const hayTexto = texto.trim().length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Grabar clase' }} />
      <ScrollView ref={scroll} style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {ramos.length ? (
          <View style={styles.wrap}>
            {ramos.map((r) => (
              <Chip key={r.id} compact label={r.name} selected={ramo === r.id} onPress={() => setRamo(ramo === r.id ? null : r.id)} leading={<View style={[styles.punto, { backgroundColor: r.color }]} />} />
            ))}
          </View>
        ) : null}

        {borrador && !texto ? (
          <View style={[styles.caja, { borderColor: colors.accent, backgroundColor: colors.accentSoft, minHeight: 0, marginTop: space.lg, gap: space.sm }]}>
            <AppText variant="headline">Tienes una transcripción sin guardar</AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              {reloj(borrador.segundos)} · {borrador.texto.slice(0, 120)}
            </AppText>
            <View style={[styles.wrap, { marginTop: space.sm }]}>
              <Chip label="Recuperar" selected onPress={recuperarBorrador} />
              <Chip label="Descartar" onPress={descartarBorrador} />
            </View>
          </View>
        ) : null}

        {/* Botón grande */}
        <View style={styles.centro}>
          <PressableScale
              accessibilityRole="button"
            onPress={grabando ? detener : empezar}
            accessibilityLabel={grabando ? 'Detener grabación' : 'Empezar a grabar la clase'}
            style={[styles.rec, { backgroundColor: grabando ? colors.danger : colors.accent }]}
          >
            <Ionicons name={grabando ? 'stop' : 'mic'} size={38} color={grabando ? '#FFFFFF' : colors.onAccent} />
          </PressableScale>
          <AppText variant="number" tabular style={{ marginTop: space.lg }}>{reloj(segundos)}</AppText>
          <AppText variant="caption" tone={grabando ? 'danger' : 'tertiary'} style={{ textAlign: 'center' }}>
            {grabando ? '● Grabando · deja el celular cerca del profe con la pantalla encendida' : hayTexto ? 'Toca para seguir grabando' : 'Toca para empezar'}
          </AppText>
        </View>

        {/* Transcripción */}
        <View style={[styles.caja, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.sm }}>Transcripción</AppText>
          {grabando ? (
            <AppText variant="body">
              {texto}
              {parcial ? <AppText variant="body" tone="tertiary">{` ${parcial}`}</AppText> : null}
              {!texto && !parcial ? <AppText variant="body" tone="tertiary">Escuchando…</AppText> : null}
            </AppText>
          ) : (
            <TextInput
              value={texto}
              onChangeText={setTexto}
              multiline
              placeholder="Aquí aparece lo que se dice en clase. Después puedes corregirlo."
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Transcripción de la clase"
              style={[type.body, { color: colors.text, minHeight: 120, textAlignVertical: 'top', padding: 0 }]}
            />
          )}
        </View>

        {resumen ? (
          <Card style={{ marginTop: space.lg }}>
            <AppText variant="overline" tone="accent">Resumen</AppText>
            <View style={{ gap: space.sm, marginTop: space.md }}>
              {resumen.map((p, k) => (
                <AppText key={k} variant="callout">• {p}</AppText>
              ))}
            </View>
          </Card>
        ) : null}

        {!grabando && hayTexto ? (
          <View style={{ gap: space.md, marginTop: space.xl }}>
            <Button label={resumen ? 'Rehacer resumen' : 'Resumir la clase'} variant="secondary" onPress={resumir} loading={ocupado === 'resumen'} disabled={ocupado != null} />
            <Button label="Crear tarjetas de estudio" variant="secondary" onPress={tarjetas} loading={ocupado === 'tarjetas'} disabled={ocupado != null} />
            <Button label="Guardar como nota" onPress={guardar} disabled={ocupado != null} />
            <Button
              label="Borrar y empezar de nuevo"
              variant="danger"
              onPress={() =>
                Alert.alert('¿Borrar la transcripción?', 'No se puede deshacer.', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Borrar',
                    style: 'destructive',
                    onPress: () => {
                      setSetting(db, CLAVE_BORRADOR, '').catch(console.warn);
                      notaId.current = null;
                      setTexto('');
                      setResumen(null);
                      setSegundos(0);
                      acumulado.current = 0;
                      ultimo.current = '';
                    },
                  },
                ])
              }
            />
          </View>
        ) : null}

        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xl }}>
          Esto es una transcripción: se guarda el TEXTO, no el audio. Usa el dictado del celular (si el español está descargado en Ajustes → Google → Voz → Reconocimiento sin conexión, no necesita internet). Lo transcrito se guarda como borrador por si la app se cierra.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  punto: { width: 10, height: 10, borderRadius: 5 },
  centro: { alignItems: 'center', marginVertical: space.xxl, gap: space.xs },
  rec: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  caja: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, minHeight: 160 },
});
