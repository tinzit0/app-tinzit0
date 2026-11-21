/**
 * Asistencia automática: una "geocerca" alrededor de tu U.
 * Android avisa cuando entras o sales (aunque la app esté cerrada) y esta tarea:
 *  - al ENTRAR: anota la llegada y marca "fui" en la clase que está empezando o en curso;
 *  - al SALIR: anota la salida, marca las clases en las que estuviste y reprograma
 *    la pregunta "¿fuiste a …?" para las clases que quedan hoy.
 *
 * IMPORTANTE: defineTask tiene que correr al cargar la app (por eso se importa en index.ts).
 * Si los módulos no existen (Expo Go, web), no hace nada.
 */
import { Platform } from 'react-native';

export const TAREA_CAMPUS = 'tinzit0-campus';

type TM = typeof import('expo-task-manager');
type Loc = typeof import('expo-location');

let tm: TM | null = null;
let loc: Loc | null = null;
try {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tm = require('expo-task-manager') as TM;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loc = require('expo-location') as Loc;
  }
} catch {
  tm = null;
  loc = null;
}

export const geocercaDisponible = () => tm !== null && loc !== null;

if (tm && loc) {
  try {
    tm.defineTask(TAREA_CAMPUS, async ({ data, error }) => {
      if (error || !data) return;
      const { eventType } = data as { eventType: number };
      try {
        const SQLite = await import('expo-sqlite');
        const db = await SQLite.openDatabaseAsync('tinzit0.db');
        const { registrarEntrada, registrarSalida, conciliarAsistencia } = await import('@/database/campus');
        const { reprogramarTodo, avisoAsistenciaMarcada } = await import('@/notifications/programar');
        const ahora = new Date();
        if (eventType === 1) await registrarEntrada(db, ahora);
        else if (eventType === 2) await registrarSalida(db, ahora);
        const marcados = await conciliarAsistencia(db, ahora);
        if (marcados.length) await avisoAsistenciaMarcada(marcados);
        await reprogramarTodo(db);
      } catch (e) {
        console.warn('Tarea de asistencia', e);
      }
    });
  } catch {
    // ya definida
  }
}

/** Activa la geocerca (pide los permisos de ubicación, incluido "todo el tiempo"). */
export async function activarGeocerca(c: { lat: number; lon: number; radio: number }): Promise<'ok' | 'sin_permiso' | 'sin_fondo' | 'no_disponible'> {
  if (!loc) return 'no_disponible';
  const fg = await loc.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'sin_permiso';
  const bg = await loc.requestBackgroundPermissionsAsync();
  if (!bg.granted) return 'sin_fondo';
  await loc.startGeofencingAsync(TAREA_CAMPUS, [
    { identifier: 'campus', latitude: c.lat, longitude: c.lon, radius: c.radio, notifyOnEnter: true, notifyOnExit: true },
  ]);
  return 'ok';
}

export async function desactivarGeocerca() {
  if (!loc) return;
  try {
    if (await loc.hasStartedGeofencingAsync(TAREA_CAMPUS)) await loc.stopGeofencingAsync(TAREA_CAMPUS);
  } catch {
    // no estaba activa
  }
}

export async function geocercaActiva(): Promise<boolean> {
  if (!loc) return false;
  try {
    return await loc.hasStartedGeofencingAsync(TAREA_CAMPUS);
  } catch {
    return false;
  }
}

export async function permisoFondo(): Promise<boolean> {
  if (!loc) return false;
  try {
    return (await loc.getBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Tu ubicación actual (para guardar dónde está tu U). */
export async function ubicacionActual(): Promise<{ lat: number; lon: number; precision: number | null } | null> {
  if (!loc) return null;
  const p = await loc.requestForegroundPermissionsAsync();
  if (!p.granted) return null;
  const pos = await loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.High });
  return { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy ?? null };
}
