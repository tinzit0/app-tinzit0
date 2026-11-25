/**
 * Amigos y rachas compartidas.
 * - Buscar por usuario o código, enviar / aceptar / rechazar solicitudes.
 * - Con cada amigo, una o más rachas (tareas del día, gym o meta de agua): suben cuando
 *   los dos cumplen el mismo día. Se actualizan al instante en ambos teléfonos (Supabase Realtime).
 * - Tono amable: perder una racha nunca se muestra como un fracaso.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { PressableScale } from '@/components/PressableScale';
import { aceptarAmistad, borrarAmistad, buscarUsuario, checkinsDelDia, crearRacha, escucharCambios, listarAmistades, listarRachas, pedirAmistad, quitarRacha, type Amistad } from '@/nube/amigos';
import { errorAmable, nubeConfigurada } from '@/nube/cliente';
import type { Perfil } from '@/nube/cuenta';
import { ACTIVIDADES, estadoRacha, mensajeRacha, nombreActividad, type Actividad, type Racha } from '@/nube/logica';
import { guardarRachasCache, subirCheckins } from '@/nube/sincronizar';
import { useSesion } from '@/nube/useSesion';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

const nombreDe = (p: Perfil) => p.display_name || `@${p.username}`;

export function AmigosScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { sesion, cargando } = useSesion();
  const [yo, setYo] = useState('');
  const [amistades, setAmistades] = useState<Amistad[]>([]);
  const [rachas, setRachas] = useState<Racha[]>([]);
  const [hechos, setHechos] = useState<Set<string>>(new Set()); // `${user_id}|${actividad}` de hoy
  const [q, setQ] = useState('');
  const [encontrado, setEncontrado] = useState<Perfil | null | undefined>(undefined);
  const [buscando, setBuscando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    if (!sesion) return;
    try {
      await subirCheckins(db).catch(() => 0); // lo tuyo de hoy primero, para que la racha se vea al día
      const hoy = toISODate();
      const [a, r, c] = await Promise.all([listarAmistades(), listarRachas(), checkinsDelDia(hoy)]);
      setYo(a.yo);
      setAmistades(a.amistades);
      setRachas(r);
      setHechos(new Set(c.map((x) => `${x.user_id}|${x.activity}`)));
      setError(null);
      const nombres = Object.fromEntries(a.amistades.map((x) => [x.otro.id, nombreDe(x.otro)]));
      guardarRachasCache(db, { rachas: r, nombres, yo: a.yo }).catch(() => {});
    } catch (e) {
      setError(errorAmable(e));
    } finally {
      setCargado(true);
    }
  }, [db, sesion]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  // Tiempo real: cuando tu amigo cumple o acepta, se recarga (agrupando cambios seguidos).
  useEffect(() => {
    if (!sesion) return;
    const dejar = escucharCambios(() => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => cargar().catch(console.warn), 400);
    });
    return () => {
      dejar();
      if (espera.current) clearTimeout(espera.current);
    };
  }, [sesion, cargar]);

  const buscar = async () => {
    if (!q.trim()) return;
    setBuscando(true);
    try {
      setEncontrado(await buscarUsuario(q.trim().replace(/^@/, '')));
    } catch (e) {
      Alert.alert('No se pudo buscar', errorAmable(e));
    } finally {
      setBuscando(false);
    }
  };

  const agregar = async (p: Perfil) => {
    try {
      await pedirAmistad(p.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setQ('');
      setEncontrado(undefined);
      await cargar();
    } catch (e) {
      Alert.alert('No se pudo enviar', errorAmable(e));
    }
  };

  const accion = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await cargar();
    } catch (e) {
      Alert.alert('No se pudo', errorAmable(e));
    }
  };

  const nuevaRacha = (amigo: Perfil) => {
    const usadas = new Set(rachas.filter((r) => r.user_a === amigo.id || r.user_b === amigo.id).map((r) => r.activity));
    const libres = ACTIVIDADES.filter((a) => !usadas.has(a.value));
    if (!libres.length) return Alert.alert('Ya tienen todas', 'Ya tienen rachas de tareas, gym y agua juntos 🔥');
    Alert.alert(`Racha con ${nombreDe(amigo)}`, '¿Qué van a cumplir los dos cada día?', [
      ...libres.map((a) => ({ text: a.label, onPress: () => accion(() => crearRacha(amigo.id, a.value as Actividad)) })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  const opcionesAmigo = (a: Amistad) =>
    Alert.alert(nombreDe(a.otro), `@${a.otro.username}`, [
      {
        text: 'Dejar de ser amigos',
        style: 'destructive',
        onPress: () =>
          Alert.alert('¿Seguro?', 'Se borran las rachas que tienen juntos.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sí, quitar', style: 'destructive', onPress: () => accion(() => borrarAmistad(a.id)) },
          ]),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  // ---------- Sin cuenta ----------
  if (!nubeConfigurada || (!cargando && !sesion)) {
    return (
      <>
        <Stack.Screen options={{ title: 'Amigos' }} />
        <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
          <View style={{ alignItems: 'center', marginTop: space.xxl }}>
            <Ionicons name="flame" size={48} color={colors.warning} />
            <AppText variant="title" style={{ marginTop: space.md, textAlign: 'center' }}>Rachas con tus amigos</AppText>
            <AppText variant="callout" tone="secondary" style={{ marginTop: space.sm, textAlign: 'center' }}>
              Elijan algo para cumplir cada día (tareas, gym o agua). Cuando los dos lo logran, la racha suma un día 🔥
            </AppText>
          </View>
          <Button label={nubeConfigurada ? 'Crear cuenta o iniciar sesión' : 'Ver cómo conectar la cuenta'} onPress={() => router.push('/cuenta')} style={{ marginTop: space.xxl }} />
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.md, textAlign: 'center' }}>
            Tus amigos solo ven sus rachas juntos. Nunca tus notas, gastos ni ahorros.
          </AppText>
        </ScrollView>
      </>
    );
  }

  const recibidas = amistades.filter((a) => a.status === 'pending' && a.addressee === yo);
  const enviadas = amistades.filter((a) => a.status === 'pending' && a.requester === yo);
  const amigos = amistades.filter((a) => a.status === 'accepted');
  const hoy = toISODate();
  const relacion = (p: Perfil) => amistades.find((a) => a.otro.id === p.id);

  return (
    <>
      <Stack.Screen options={{ title: 'Amigos' }} />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await cargar();
              setRefrescando(false);
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Buscar */}
        <View style={styles.fila}>
          <View style={{ flex: 1 }}>
            <Field value={q} onChangeText={setQ} placeholder="Usuario o código de amigo" autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={buscar} accessibilityLabel="Buscar amigo por usuario o código" />
          </View>
          <Button label="Buscar" variant="secondary" onPress={buscar} loading={buscando} disabled={!q.trim()} />
        </View>
        {encontrado === null ? (
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>No encontré a nadie con ese usuario o código. Revisa que esté bien escrito.</AppText>
        ) : encontrado ? (
          <Card style={[styles.fila, { marginTop: space.md }]}>
            <View style={{ flex: 1 }}>
              <AppText variant="headline">{nombreDe(encontrado)}</AppText>
              <AppText variant="caption" tone="tertiary">@{encontrado.username}</AppText>
            </View>
            {relacion(encontrado) ? (
              <AppText variant="caption" tone="accent">{relacion(encontrado)!.status === 'accepted' ? 'Ya son amigos' : 'Solicitud pendiente'}</AppText>
            ) : (
              <Button label="Agregar" onPress={() => agregar(encontrado)} />
            )}
          </Card>
        ) : null}

        {error ? (
          <Card style={{ marginTop: space.lg, backgroundColor: colors.warningSoft, borderColor: 'transparent' }}>
            <AppText variant="callout">{error}</AppText>
          </Card>
        ) : null}
        {!cargado ? <ActivityIndicator color={colors.accent} style={{ marginTop: space.xxl }} /> : null}

        {/* Solicitudes */}
        {recibidas.length ? (
          <View style={styles.seccion}>
            <AppText variant="overline" tone="accent" style={styles.titulo}>Te quieren agregar</AppText>
            {recibidas.map((a) => (
              <Card key={a.id} style={[styles.fila, { marginBottom: space.sm }]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="headline">{nombreDe(a.otro)}</AppText>
                  <AppText variant="caption" tone="tertiary">@{a.otro.username}</AppText>
                </View>
                <Button label="Aceptar" onPress={() => accion(() => aceptarAmistad(a.id))} />
                <PressableScale accessibilityRole="button" accessibilityLabel={`Rechazar a ${nombreDe(a.otro)}`} hitSlop={8} onPress={() => accion(() => borrarAmistad(a.id))} style={styles.x}>
                  <Ionicons name="close" size={20} color={colors.textTertiary} />
                </PressableScale>
              </Card>
            ))}
          </View>
        ) : null}

        {/* Amigos y rachas */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={styles.titulo}>Tus amigos</AppText>
          {cargado && !amigos.length ? (
            <AppText variant="callout" tone="secondary">Busca a tu amigo por su usuario o código. Cuando acepte, eligen qué racha quieren tener.</AppText>
          ) : null}
          {amigos.map((a) => {
            const suyas = rachas.filter((r) => r.user_a === a.otro.id || r.user_b === a.otro.id);
            return (
              <Card key={a.id} style={{ marginBottom: space.md }}>
                <PressableScale accessibilityRole="button" accessibilityLabel={`Opciones de ${nombreDe(a.otro)}`} onLongPress={() => opcionesAmigo(a)} style={styles.fila}>
                  <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                    <AppText variant="headline" tone="accent">{(a.otro.display_name || a.otro.username).charAt(0).toUpperCase()}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="headline">{nombreDe(a.otro)}</AppText>
                    <AppText variant="caption" tone="tertiary">@{a.otro.username}</AppText>
                  </View>
                </PressableScale>

                {suyas.map((r) => {
                  const e = estadoRacha(r, hoy, hechos.has(`${yo}|${r.activity}`), hechos.has(`${a.otro.id}|${r.activity}`));
                  return (
                    <PressableScale
                      key={r.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Racha de ${nombreActividad(r.activity)}: ${e.dias} días. ${mensajeRacha(e, nombreDe(a.otro))}`}
                      onLongPress={() =>
                        Alert.alert(`Racha de ${nombreActividad(r.activity)}`, `Récord: ${r.best} ${r.best === 1 ? 'día' : 'días'}.`, [
                          { text: 'Quitar racha', style: 'destructive', onPress: () => accion(() => quitarRacha(r.id)) },
                          { text: 'Cerrar', style: 'cancel' },
                        ])
                      }
                      style={[styles.racha, { backgroundColor: e.porMantener ? colors.warningSoft : colors.surfaceRaised }]}
                    >
                      <View style={styles.fuego}>
                        <Ionicons name={e.dias > 0 ? 'flame' : 'flame-outline'} size={26} color={e.dias > 0 ? colors.warning : colors.textTertiary} />
                        <AppText variant="headline" tabular>{e.dias}</AppText>
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="callout">{nombreActividad(r.activity)}</AppText>
                        <AppText variant="caption" tone="secondary">{mensajeRacha(e, nombreDe(a.otro))}</AppText>
                        <View style={[styles.fila, { marginTop: space.xs, gap: space.sm }]}>
                          <Estado ok={e.yoHoy} texto="Tú" />
                          <Estado ok={e.amigoHoy} texto={a.otro.display_name?.split(' ')[0] || a.otro.username} />
                        </View>
                      </View>
                    </PressableScale>
                  );
                })}
                <Button label={suyas.length ? 'Otra racha' : 'Empezar una racha'} variant="secondary" onPress={() => nuevaRacha(a.otro)} style={{ marginTop: space.md }} />
              </Card>
            );
          })}
        </View>

        {enviadas.length ? (
          <View style={styles.seccion}>
            <AppText variant="overline" tone="tertiary" style={styles.titulo}>Esperando respuesta</AppText>
            {enviadas.map((a) => (
              <View key={a.id} style={[styles.fila, { paddingVertical: space.sm }]}>
                <AppText variant="callout" style={{ flex: 1 }}>@{a.otro.username}</AppText>
                <Button label="Cancelar" variant="secondary" onPress={() => accion(() => borrarAmistad(a.id))} />
              </View>
            ))}
          </View>
        ) : null}

        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xxl }}>
          Tus amigos solo ven sus rachas juntos y si cumpliste hoy. Mantén presionado un amigo o una racha para más opciones.
        </AppText>
      </ScrollView>
    </>
  );
}

function Estado({ ok, texto }: { ok: boolean; texto: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.estado, { backgroundColor: ok ? colors.accentSoft : 'transparent', borderColor: ok ? 'transparent' : colors.border }]}>
      <Ionicons name={ok ? 'checkmark' : 'ellipse-outline'} size={12} color={ok ? colors.accent : colors.textTertiary} />
      <AppText variant="caption" tone={ok ? 'accent' : 'tertiary'} numberOfLines={1}>{texto}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  seccion: { marginTop: space.xxl },
  titulo: { marginBottom: space.md },
  x: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  racha: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, marginTop: space.md },
  fuego: { alignItems: 'center', width: 44 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, maxWidth: 140 },
});
