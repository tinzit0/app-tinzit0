/**
 * Música (Spotify) dentro de Tinzit0.
 * - Sin cuenta: buscas algo y Spotify lo reproduce (también por voz: "pon Bad Bunny").
 * - Con cuenta conectada: ves lo que suena, buscas canciones y playlists, ves las tuyas
 *   y, con Premium, controlas pausa / siguiente / anterior desde aquí.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { PressableScale } from '@/components/PressableScale';
import { ProgressBar } from '@/components/ProgressBar';
import * as sp from '@/spotify/spotify';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';

const RAPIDAS = ['Música para entrenar', 'Lofi para estudiar', 'Éxitos en español', 'Reggaetón', 'Rock en español', 'Música para dormir'];

function mmss(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MusicaScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [sonando, setSonando] = useState<sp.Sonando | null>(null);
  const [leidoEn, setLeidoEn] = useState(0); // cuándo se leyó "sonando"
  const [ahora, setAhora] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<sp.ResultadoBusqueda | null>(null);
  const [playlists, setPlaylists] = useState<{ id: string; uri: string; nombre: string; imagen: string | null }[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const s = await sp.queSuena();
      setSonando(s);
      setLeidoEn(Date.now());
      setAhora(Date.now());
    } catch (e) {
      if (e instanceof sp.ErrorSpotify && e.codigo === 'sin_cuenta') setConectado(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      (async () => {
        const c = await sp.conectado();
        if (!vivo) return;
        setConectado(c);
        if (c) {
          await refrescar();
          sp.misPlaylists().then((p) => vivo && setPlaylists(p)).catch(() => {});
          reloj.current = setInterval(refrescar, 5000);
        }
      })().catch(console.warn);
      return () => {
        vivo = false;
        if (reloj.current) clearInterval(reloj.current);
      };
    }, [refrescar]),
  );

  // Barra de progreso que avanza sola entre actualizaciones
  useEffect(() => {
    if (!sonando?.reproduciendo) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sonando]);
  const progreso = !sonando
    ? 0
    : sonando.reproduciendo && leidoEn && ahora > leidoEn
      ? Math.min(sonando.progresoMs + (ahora - leidoEn), sonando.duracionMs)
      : sonando.progresoMs;

  const ejecutar = async (f: () => Promise<unknown>) => {
    setAviso(null);
    try {
      await f();
      setTimeout(refrescar, 600);
    } catch (e) {
      setAviso(e instanceof sp.ErrorSpotify ? e.message : 'No pude hablar con Spotify.');
    }
  };

  const pedidoBusqueda = useRef(0);
  const buscar = async (q = busqueda) => {
    if (!q.trim()) return;
    if (!conectado) {
      await sp.reproducirBusqueda(q.trim());
      return;
    }
    const mio = ++pedidoBusqueda.current; // solo vale la última búsqueda
    setBuscando(true);
    try {
      const r = await sp.buscar(q.trim());
      if (mio !== pedidoBusqueda.current) return;
      setResultados(r);
    } catch (e) {
      Alert.alert('Spotify', e instanceof sp.ErrorSpotify ? e.message : 'No pude buscar ahora.');
    } finally {
      setBuscando(false);
    }
  };

  const tocar = async (uri: string) => {
    setAviso(null);
    try {
      const r = await sp.reproducir(uri);
      if (r === 'abierto') setAviso('Con cuenta gratis, Spotify solo deja reproducir desde su app: te la abrí.');
      setTimeout(refrescar, 1200);
    } catch (e) {
      setAviso(e instanceof sp.ErrorSpotify ? e.message : 'No pude reproducir eso.');
    }
  };

  const Fila = ({ img, titulo, sub, uri, redonda }: { img: string | null; titulo: string; sub: string; uri: string; redonda?: boolean }) => (
    <Pressable onPress={() => tocar(uri)} style={styles.fila} accessibilityRole="button" accessibilityLabel={`Reproducir ${titulo}`}>
      {img ? (
        <Image source={{ uri: img }} style={[styles.mini, redonda && { borderRadius: 24 }]} />
      ) : (
        <View style={[styles.mini, { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="musical-notes" size={18} color={colors.textTertiary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <AppText variant="callout" numberOfLines={1}>{titulo}</AppText>
        <AppText variant="caption" tone="tertiary" numberOfLines={1}>{sub}</AppText>
      </View>
      <Ionicons name="play-circle" size={28} color={colors.accent} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Música' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Lo que suena */}
        {conectado && sonando ? (
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
              {sonando.imagen ? <Image source={{ uri: sonando.imagen }} style={styles.portada} /> : null}
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="overline" tone="accent">{sonando.reproduciendo ? 'Sonando ahora' : 'En pausa'}</AppText>
                <AppText variant="headline" numberOfLines={2}>{sonando.nombre}</AppText>
                <AppText variant="callout" tone="secondary" numberOfLines={1}>{sonando.artistas}</AppText>
                {sonando.dispositivo ? <AppText variant="caption" tone="tertiary">En {sonando.dispositivo}</AppText> : null}
              </View>
            </View>
            <ProgressBar value={progreso} max={sonando.duracionMs || 1} />
            <View style={styles.tiempos}>
              <AppText variant="caption" tone="tertiary" tabular>{mmss(progreso)}</AppText>
              <AppText variant="caption" tone="tertiary" tabular>{mmss(sonando.duracionMs)}</AppText>
            </View>
            <View style={styles.controles}>
              <PressableScale onPress={() => ejecutar(sp.anterior)} accessibilityRole="button" accessibilityLabel="Anterior" style={styles.ctrl}>
                <Ionicons name="play-skip-back" size={26} color={colors.text} />
              </PressableScale>
              <PressableScale
                onPress={() => ejecutar(sonando.reproduciendo ? sp.pausar : sp.continuar)}
                accessibilityRole="button"
                accessibilityLabel={sonando.reproduciendo ? 'Pausar' : 'Reproducir'}
                style={[styles.play, { backgroundColor: colors.accent }]}
              >
                <Ionicons name={sonando.reproduciendo ? 'pause' : 'play'} size={30} color={colors.onAccent} />
              </PressableScale>
              <PressableScale onPress={() => ejecutar(sp.siguiente)} accessibilityRole="button" accessibilityLabel="Siguiente" style={styles.ctrl}>
                <Ionicons name="play-skip-forward" size={26} color={colors.text} />
              </PressableScale>
            </View>
          </Card>
        ) : conectado ? (
          <Card style={styles.vacio}>
            <Ionicons name="musical-notes-outline" size={28} color={colors.textTertiary} />
            <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
              No está sonando nada. Busca algo abajo o dime “pon música para entrenar”.
            </AppText>
          </Card>
        ) : null}
        {aviso ? <AppText variant="caption" tone="warning" style={{ marginTop: space.sm, textAlign: 'center' }}>{aviso}</AppText> : null}

        {/* Buscar */}
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: space.lg }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            onSubmitEditing={() => buscar()}
            placeholder="¿Qué quieres escuchar?"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            accessibilityLabel="Buscar música"
            style={[type.body, { flex: 1, color: colors.text, paddingVertical: space.md }]}
          />
          {buscando ? <ActivityIndicator color={colors.accent} /> : null}
        </View>
        <View style={styles.chips}>
          {RAPIDAS.map((r) => (
            <Chip key={r} compact label={r} onPress={() => (conectado ? (setBusqueda(r), buscar(r)) : sp.reproducirBusqueda(r))} />
          ))}
        </View>

        {/* Resultados */}
        {resultados ? (
          <View style={{ marginTop: space.lg, gap: space.xs }}>
            {resultados.canciones.length ? <AppText variant="overline" tone="tertiary" style={styles.h}>Canciones</AppText> : null}
            {resultados.canciones.map((c) => (
              <Fila key={c.id} img={c.imagen} titulo={c.nombre} sub={c.artistas} uri={c.uri} />
            ))}
            {resultados.artistas.length ? <AppText variant="overline" tone="tertiary" style={styles.h}>Artistas</AppText> : null}
            {resultados.artistas.slice(0, 4).map((a) => (
              <Fila key={a.id} img={a.imagen} titulo={a.nombre} sub="Artista" uri={a.uri} redonda />
            ))}
            {resultados.playlists.length ? <AppText variant="overline" tone="tertiary" style={styles.h}>Playlists</AppText> : null}
            {resultados.playlists.slice(0, 5).map((p) => (
              <Fila key={p.id} img={p.imagen} titulo={p.nombre} sub={p.dueno} uri={p.uri} />
            ))}
          </View>
        ) : null}

        {/* Tus playlists */}
        {conectado && !resultados && playlists.length ? (
          <View style={{ marginTop: space.lg, gap: space.xs }}>
            <AppText variant="overline" tone="tertiary" style={styles.h}>Tus playlists</AppText>
            {playlists.map((p) => (
              <Fila key={p.id} img={p.imagen} titulo={p.nombre} sub="Playlist" uri={p.uri} />
            ))}
          </View>
        ) : null}

        {/* Sin cuenta conectada */}
        {conectado === false ? (
          <Card style={{ marginTop: space.xl, gap: space.sm }}>
            <AppText variant="headline">Conecta tu Spotify</AppText>
            <AppText variant="callout" tone="secondary">
              Así ves lo que suena, buscas canciones y ves tus playlists desde aquí. Es gratis. Sin conectar, igual puedes pedir música: Spotify la
              reproduce sola.
            </AppText>
            <Button label="Configurar en Ajustes" variant="secondary" onPress={() => router.push('/ajustes')} />
          </Card>
        ) : null}

        <Button label="Abrir la app de Spotify" variant="secondary" onPress={() => sp.abrirEnSpotify('spotify:')} style={{ marginTop: space.xl }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  portada: { width: 88, height: 88, borderRadius: radius.md },
  tiempos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -space.sm },
  controles: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xxl },
  ctrl: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  play: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  vacio: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  h: { marginTop: space.md, marginBottom: space.xs, marginLeft: space.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.xs },
  mini: { width: 48, height: 48, borderRadius: radius.sm },
});
