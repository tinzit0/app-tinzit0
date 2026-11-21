/**
 * Asistencia automática: guardas dónde está tu U y Tinzit0 marca "fui" cuando
 * estás ahí durante una clase. Si no te detecta, te pregunta al terminar la clase.
 * La ubicación de la U queda solo en tu celular.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { guardarCampus, obtenerCampus, visitasDelDia, type Campus } from '@/database/campus';
import { todosLosBloques } from '@/database/estudio';
import { setSetting } from '@/database/queries';
import { activarGeocerca, desactivarGeocerca, geocercaActiva, geocercaDisponible, permisoFondo, ubicacionActual } from '@/estudio/campusTarea';
import type { Visita } from '@/estudio/logica';
import { reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const RADIOS = [150, 300, 500, 800];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function CampusScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [campus, setCampus] = useState<Campus | null>(null);
  const [activa, setActiva] = useState(false);
  const [fondo, setFondo] = useState(false);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [hayHorario, setHayHorario] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const [c, a, f, v, b] = await Promise.all([obtenerCampus(db), geocercaActiva(), permisoFondo(), visitasDelDia(db), todosLosBloques(db)]);
    setCampus(c);
    setActiva(a);
    setFondo(f);
    setVisitas(v);
    setHayHorario(b.length > 0);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
      const sub = AppState.addEventListener('change', (e) => e === 'active' && cargar().catch(console.warn));
      return () => sub.remove();
    }, [cargar]),
  );

  const guardarAqui = async () => {
    if (!geocercaDisponible()) {
      Alert.alert('No disponible', 'La asistencia automática funciona en la app instalada (APK).');
      return;
    }
    setOcupado(true);
    try {
      const u = await ubicacionActual();
      if (!u) {
        Alert.alert('Sin ubicación', 'Necesito permiso de ubicación para saber dónde está tu U.');
        return;
      }
      const c = { lat: u.lat, lon: u.lon, radio: campus?.radio ?? 300 };
      await guardarCampus(db, c);
      setCampus(c);
      if (activa) await activarGeocerca(c);
      Alert.alert('Ubicación guardada ✓', `Guardé este punto como tu U${u.precision ? ` (precisión ±${Math.round(u.precision)} m)` : ''}. Ahora activa la asistencia automática.`);
    } catch (e) {
      Alert.alert('No pude obtener tu ubicación', e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const cambiarRadio = async (r: number) => {
    if (!campus) return;
    const c = { ...campus, radio: r };
    await guardarCampus(db, c);
    setCampus(c);
    if (activa) await activarGeocerca(c).catch(() => {});
  };

  const activar = async () => {
    if (!campus) return;
    setOcupado(true);
    try {
      const r = await activarGeocerca(campus);
      if (r === 'ok') {
        await setSetting(db, 'asistencia_auto', '1');
        reprogramarTodo(db).catch(() => {});
        await cargar();
        return;
      }
      if (r === 'sin_fondo') {
        Alert.alert(
          'Falta un permiso',
          'Para saber si llegaste a la U con la app cerrada, Android necesita la ubicación "Permitir todo el tiempo".\n\nToca "Abrir ajustes" → Permisos → Ubicación → "Permitir todo el tiempo", y vuelve.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ],
        );
      } else if (r === 'sin_permiso') Alert.alert('Sin permiso', 'Necesito permiso de ubicación para la asistencia automática.');
      else Alert.alert('No disponible', 'La asistencia automática funciona en la app instalada (APK).');
    } finally {
      setOcupado(false);
    }
  };

  const desactivar = async () => {
    await desactivarGeocerca();
    await setSetting(db, 'asistencia_auto', '0');
    reprogramarTodo(db).catch(() => {});
    await cargar();
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Asistencia automática' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <Card style={[styles.fila, activa ? { backgroundColor: colors.accentSoft, borderColor: 'transparent' } : null]}>
          <Ionicons name={activa ? 'location' : 'location-outline'} size={24} color={activa ? colors.accent : colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <AppText variant="headline">{activa ? 'Activada' : 'Desactivada'}</AppText>
            <AppText variant="caption" tone="secondary">
              Cuando llegas a la U en horario de clase, marco "fui". Si no te detecto, al terminar la clase te pregunto "¿fuiste?".
            </AppText>
          </View>
        </Card>

        {!hayHorario ? (
          <AppText variant="callout" tone="warning" style={{ marginTop: space.md }}>
            Primero agrega el horario de tus ramos en Estudio: así sé a qué hora tienes cada clase.
          </AppText>
        ) : null}

        {/* Paso 1 */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>1 · Dónde está tu U</AppText>
          <AppText variant="callout" tone="secondary">
            {campus ? 'Ubicación guardada ✓ (solo en tu celular).' : 'Cuando estés en la U, toca el botón para guardar ese lugar.'}
          </AppText>
          <Button label={campus ? 'Actualizar ubicación' : 'Guardar ubicación de la U'} variant={campus ? 'secondary' : 'primary'} onPress={guardarAqui} loading={ocupado} style={{ marginTop: space.md }} />
          {campus ? (
            <>
              <AppText variant="caption" tone="tertiary" style={{ marginTop: space.lg, marginBottom: space.sm }}>
                Radio (qué tan grande es tu campus)
              </AppText>
              <View style={styles.wrap}>
                {RADIOS.map((r) => (
                  <Chip key={r} compact label={`${r} m`} selected={campus.radio === r} onPress={() => cambiarRadio(r)} />
                ))}
              </View>
            </>
          ) : null}
        </View>

        {/* Paso 2 */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>2 · Activar</AppText>
          {activa ? (
            <Button label="Desactivar asistencia automática" variant="danger" onPress={desactivar} />
          ) : (
            <Button label="Activar asistencia automática" onPress={activar} disabled={!campus} loading={ocupado} />
          )}
          {activa && !fondo ? (
            <AppText variant="caption" tone="warning" style={{ marginTop: space.sm }}>
              Falta "Permitir todo el tiempo" en la ubicación: sin eso solo funciona con la app abierta.
            </AppText>
          ) : (
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
              Android pedirá ubicación "Permitir todo el tiempo". Solo se usa para saber si entras o sales de la U (gasta muy poca batería).
            </AppText>
          )}
        </View>

        {/* Hoy */}
        {activa ? (
          <View style={styles.seccion}>
            <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Hoy</AppText>
            {visitas.length ? (
              visitas.map((v, k) => (
                <AppText key={k} variant="callout">
                  Llegaste a las {hhmm(v.entrada)}{v.salida ? ` · saliste a las ${hhmm(v.salida)}` : ' · sigues en la U'}
                </AppText>
              ))
            ) : (
              <AppText variant="callout" tone="secondary">Todavía no te detecto en la U hoy.</AppText>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  seccion: { marginTop: space.xxl },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
