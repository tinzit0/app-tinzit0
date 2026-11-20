/**
 * Gym: rutina semanal, ejercicios, series registradas e historial.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { weekdayMonFirst } from '@/utils/fechas';
import type { Rango } from './gastos';

export type DiaRutina = { weekday: number; label: string };
export type Ejercicio = { id: number; name: string; muscle: string | null };
export type EjercicioConStats = Ejercicio & { ultima: string | null; maxPeso: number | null; sesiones: number };
export type Serie = {
  id: number;
  exercise_id: number;
  date: string;
  set_number: number;
  reps: number;
  weight: number;
};
export type SerieConNombre = Serie & { name: string };
export type Sesion = { date: string; sets: Serie[]; maxPeso: number; volumen: number };

/** Sugerencias para armar la rutina rápido. */
export const GRUPOS = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Full body', 'Cardio'];

// ---------- Rutina ----------

export async function obtenerRutina(db: SQLiteDatabase): Promise<DiaRutina[]> {
  return db.getAllAsync<DiaRutina>('SELECT weekday, label FROM gym_routine ORDER BY weekday');
}

/** Guarda lo que toca un día. Si label es vacío/null, ese día queda como descanso. */
export async function guardarDiaRutina(db: SQLiteDatabase, weekday: number, label: string | null) {
  if (!label?.trim()) {
    await db.runAsync('DELETE FROM gym_routine WHERE weekday = ?', weekday);
  } else {
    await db.runAsync(
      'INSERT INTO gym_routine (weekday, label) VALUES (?, ?) ON CONFLICT(weekday) DO UPDATE SET label = excluded.label',
      weekday,
      label.trim(),
    );
  }
}

export async function rutinaDeHoy(db: SQLiteDatabase, fecha = new Date()): Promise<string | null> {
  const r = await db.getFirstAsync<{ label: string }>(
    'SELECT label FROM gym_routine WHERE weekday = ?',
    weekdayMonFirst(fecha),
  );
  return r?.label ?? null;
}

// ---------- Ejercicios ----------

export async function listarEjercicios(db: SQLiteDatabase): Promise<EjercicioConStats[]> {
  return db.getAllAsync<EjercicioConStats>(
    `SELECT e.id, e.name, e.muscle,
            MAX(s.date) AS ultima,
            MAX(s.weight) AS maxPeso,
            COUNT(DISTINCT s.date) AS sesiones
     FROM exercises e LEFT JOIN workout_sets s ON s.exercise_id = e.id
     GROUP BY e.id
     ORDER BY ultima IS NULL, ultima DESC, e.name`,
  );
}

export async function obtenerEjercicio(db: SQLiteDatabase, id: number): Promise<Ejercicio | null> {
  return db.getFirstAsync<Ejercicio>('SELECT * FROM exercises WHERE id = ?', id);
}

/** Crea el ejercicio si no existe (sin distinguir mayúsculas) y devuelve su id. */
export async function obtenerOCrearEjercicio(db: SQLiteDatabase, nombre: string, musculo?: string | null) {
  const limpio = nombre.trim().replace(/\s+/g, ' ');
  const existe = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM exercises WHERE lower(name) = lower(?)',
    limpio,
  );
  if (existe) return existe.id;
  const r = await db.runAsync('INSERT INTO exercises (name, muscle) VALUES (?, ?)', limpio, musculo ?? null);
  return r.lastInsertRowId;
}

export async function eliminarEjercicio(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM exercises WHERE id = ?', id);
}

// ---------- Series ----------

export async function seriesDeFecha(db: SQLiteDatabase, fecha: string): Promise<SerieConNombre[]> {
  return db.getAllAsync<SerieConNombre>(
    `SELECT s.*, e.name FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.date = ? ORDER BY s.id`,
    fecha,
  );
}

export async function agregarSerie(db: SQLiteDatabase, exerciseId: number, fecha: string, reps: number, peso: number) {
  const n = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workout_sets WHERE exercise_id = ? AND date = ?',
    exerciseId,
    fecha,
  );
  await db.runAsync(
    'INSERT INTO workout_sets (exercise_id, date, set_number, reps, weight) VALUES (?, ?, ?, ?, ?)',
    exerciseId,
    fecha,
    (n?.n ?? 0) + 1,
    Math.max(1, Math.round(reps)),
    Math.max(0, peso),
  );
}

export async function eliminarSerie(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM workout_sets WHERE id = ?', id);
}

/** Última serie registrada de un ejercicio (para precargar reps y peso). */
export async function ultimaSerie(db: SQLiteDatabase, exerciseId: number): Promise<Serie | null> {
  return db.getFirstAsync<Serie>(
    'SELECT * FROM workout_sets WHERE exercise_id = ? ORDER BY date DESC, id DESC LIMIT 1',
    exerciseId,
  );
}

/** Historial de un ejercicio agrupado por día, del más antiguo al más nuevo. */
export async function historialEjercicio(db: SQLiteDatabase, exerciseId: number): Promise<Sesion[]> {
  const sets = await db.getAllAsync<Serie>(
    'SELECT * FROM workout_sets WHERE exercise_id = ? ORDER BY date, set_number',
    exerciseId,
  );
  const sesiones: Sesion[] = [];
  for (const s of sets) {
    let ses = sesiones[sesiones.length - 1];
    if (!ses || ses.date !== s.date) {
      ses = { date: s.date, sets: [], maxPeso: 0, volumen: 0 };
      sesiones.push(ses);
    }
    ses.sets.push(s);
    ses.maxPeso = Math.max(ses.maxPeso, s.weight);
    ses.volumen += s.weight * s.reps;
  }
  return sesiones;
}

/** Cuántos días distintos entrenaste en un rango. */
export async function diasEntrenados(db: SQLiteDatabase, r: Rango): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(DISTINCT date) AS n FROM workout_sets WHERE date BETWEEN ? AND ?',
    r.desde,
    r.hasta,
  );
  return row?.n ?? 0;
}

/** Fechas entrenadas en un rango (para marcar los días en la semana). */
export async function fechasEntrenadas(db: SQLiteDatabase, r: Rango): Promise<string[]> {
  const rows = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM workout_sets WHERE date BETWEEN ? AND ?',
    r.desde,
    r.hasta,
  );
  return rows.map((x) => x.date);
}

/** "3×10 · 40 kg" — resumen corto de las series de una sesión. */
export function resumirSeries(sets: Pick<Serie, 'reps' | 'weight'>[]): string {
  if (sets.length === 0) return '';
  const mismas = sets.every((s) => s.reps === sets[0].reps && s.weight === sets[0].weight);
  const kg = (w: number) => `${Number.isInteger(w) ? w : w.toFixed(1)} kg`;
  if (mismas) return `${sets.length}×${sets[0].reps} · ${kg(sets[0].weight)}`;
  return sets.map((s) => `${s.reps}×${kg(s.weight)}`).join('  ');
}
