/**
 * Visitas a la U (llegadas y salidas detectadas por ubicación) y asistencia automática.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { clasesAsistidas, type Visita } from '@/estudio/logica';
import { toISODate } from '@/utils/fechas';
import { marcarAsistencia, todosLosBloques } from './estudio';
import { getSetting, setSetting } from './queries';

export type Campus = { lat: number; lon: number; radio: number };

const dosDig = (n: number) => String(n).padStart(2, '0');
/** Fecha y hora local como texto: '2026-11-21T08:15:00' */
export function horaLocal(d = new Date()) {
  return `${toISODate(d)}T${dosDig(d.getHours())}:${dosDig(d.getMinutes())}:${dosDig(d.getSeconds())}`;
}
const leerHora = (s: string) => new Date(s.replace(' ', 'T'));

export async function obtenerCampus(db: SQLiteDatabase): Promise<Campus | null> {
  const raw = await getSetting(db, 'campus');
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Campus;
    return Number.isFinite(c.lat) && Number.isFinite(c.lon) ? { ...c, radio: c.radio || 300 } : null;
  } catch {
    return null;
  }
}

export async function guardarCampus(db: SQLiteDatabase, c: Campus | null) {
  await setSetting(db, 'campus', c ? JSON.stringify(c) : '');
}

export async function asistenciaAutoActiva(db: SQLiteDatabase) {
  return (await getSetting(db, 'asistencia_auto')) === '1' && (await obtenerCampus(db)) !== null;
}

export async function visitaAbierta(db: SQLiteDatabase): Promise<{ id: number; enter_at: string } | null> {
  // Una visita "abierta" de hace más de 16 h se considera olvidada (el celular no avisó la salida).
  const v = await db.getFirstAsync<{ id: number; enter_at: string }>('SELECT id, enter_at FROM campus_visits WHERE exit_at IS NULL ORDER BY id DESC LIMIT 1');
  if (!v) return null;
  if (Date.now() - leerHora(v.enter_at).getTime() > 16 * 3600_000) {
    await db.runAsync('UPDATE campus_visits SET exit_at = enter_at WHERE id = ?', v.id);
    return null;
  }
  return v;
}

export async function registrarEntrada(db: SQLiteDatabase, ahora = new Date()) {
  if (await visitaAbierta(db)) return;
  await db.runAsync('INSERT INTO campus_visits (enter_at) VALUES (?)', horaLocal(ahora));
}

export async function registrarSalida(db: SQLiteDatabase, ahora = new Date()) {
  const v = await visitaAbierta(db);
  if (v) await db.runAsync('UPDATE campus_visits SET exit_at = ? WHERE id = ?', horaLocal(ahora), v.id);
}

export async function visitasDelDia(db: SQLiteDatabase, dia = new Date()): Promise<Visita[]> {
  const iso = toISODate(dia);
  const filas = await db.getAllAsync<{ enter_at: string; exit_at: string | null }>(
    'SELECT enter_at, exit_at FROM campus_visits WHERE substr(enter_at, 1, 10) = ? OR (exit_at IS NOT NULL AND substr(exit_at, 1, 10) = ?) OR exit_at IS NULL ORDER BY id',
    iso,
    iso,
  );
  return filas.map((f) => ({ entrada: leerHora(f.enter_at), salida: f.exit_at ? leerHora(f.exit_at) : null }));
}

/**
 * Marca "fui" en las clases de hoy a las que estuviste (según tus visitas), si aún no tenían registro.
 * Devuelve los nombres de los ramos marcados.
 */
export async function conciliarAsistencia(db: SQLiteDatabase, ahora = new Date()): Promise<string[]> {
  if (!(await asistenciaAutoActiva(db))) return [];
  const bloques = await todosLosBloques(db);
  const visitas = await visitasDelDia(db, ahora);
  if (!visitas.length) return [];
  const iso = toISODate(ahora);
  const marcados: string[] = [];
  for (const b of clasesAsistidas(bloques, visitas, ahora, ahora)) {
    const ya = await db.getFirstAsync('SELECT 1 FROM attendance WHERE course_id = ? AND date = ?', b.course_id, iso);
    if (ya) continue;
    await marcarAsistencia(db, b.course_id, true, iso);
    marcados.push(b.name);
  }
  return marcados;
}
