/**
 * Todo lo que tiene que ver con Tareas en la base de datos.
 *
 * Tipos de tarea:
 * - Una vez ("none"): tiene una fecha (o ninguna) y se marca como hecha una sola vez.
 * - Todos los días ("daily"): aparece cada día; se marca por separado cada día.
 * - Ciertos días ("weekdays"): igual, pero solo los días elegidos (ej: lunes y jueves).
 * - Semanal: una tarea "una vez" con scope = 'semanal' y fecha = domingo de esa semana.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { endOfWeek, fromISODate, startOfWeek, toISODate, weekdayMonFirst } from '@/utils/fechas';

export type Prioridad = 'alta' | 'media' | 'baja';
export type Repeticion = 'none' | 'daily' | 'weekdays';
export type Alcance = 'diaria' | 'semanal';

export type Tarea = {
  id: number;
  title: string;
  notes: string | null;
  priority: Prioridad;
  scope: Alcance;
  due_date: string | null;
  repeat_type: Repeticion;
  repeat_days: string | null;
  done: number;
  done_at: string | null;
  created_at: string;
};

/** Una tarea "en un día concreto", con su estado de ese día. */
export type TareaDelDia = Tarea & { hecha: boolean; atrasada: boolean };

export type NuevaTarea = {
  title: string;
  notes?: string | null;
  priority: Prioridad;
  scope: Alcance;
  due_date: string | null;
  repeat_type: Repeticion;
  repeat_days: number[];
};

const ORDEN_PRIORIDAD = `CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END`;

/** Ordena: pendientes primero, luego por prioridad, luego por antigüedad. */
function ordenar(a: TareaDelDia, b: TareaDelDia) {
  if (a.hecha !== b.hecha) return a.hecha ? 1 : -1;
  const p = { alta: 0, media: 1, baja: 2 };
  if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
  return a.id - b.id;
}

/** ¿Esta tarea repetitiva "toca" en esta fecha? */
export function tocaEnFecha(t: Pick<Tarea, 'repeat_type' | 'repeat_days'>, fecha: Date): boolean {
  if (t.repeat_type === 'daily') return true;
  if (t.repeat_type === 'weekdays') {
    const dias = (t.repeat_days ?? '').split(',').filter(Boolean).map(Number);
    return dias.includes(weekdayMonFirst(fecha));
  }
  return false;
}

/**
 * Tareas de un día:
 * - las de una vez con esa fecha
 * - las repetitivas que tocan ese día
 * - si es hoy: también las atrasadas que siguen pendientes
 */
export async function tareasDelDia(db: SQLiteDatabase, fechaISO: string): Promise<TareaDelDia[]> {
  const fecha = fromISODate(fechaISO);
  const esHoy = fechaISO === toISODate();

  const unaVez = await db.getAllAsync<Tarea>(
    `SELECT * FROM tasks
     WHERE repeat_type = 'none' AND scope = 'diaria'
       AND (due_date = $f ${esHoy ? `OR (due_date < $f AND done = 0)` : ''})`,
    { $f: fechaISO },
  );

  const repetitivas = await db.getAllAsync<Tarea>(`SELECT * FROM tasks WHERE repeat_type != 'none'`);
  const completadas = await db.getAllAsync<{ task_id: number }>(
    'SELECT task_id FROM task_completions WHERE date = ?',
    fechaISO,
  );
  const hechasSet = new Set(completadas.map((c) => c.task_id));

  const lista: TareaDelDia[] = [
    ...unaVez.map((t) => ({
      ...t,
      hecha: t.done === 1,
      atrasada: !!t.due_date && t.due_date < fechaISO && t.done === 0,
    })),
    ...repetitivas
      // Una tarea repetitiva solo existe desde el día en que la creaste.
      .filter((t) => t.created_at.slice(0, 10) <= fechaISO && tocaEnFecha(t, fecha))
      .map((t) => ({ ...t, hecha: hechasSet.has(t.id), atrasada: false })),
  ];
  return lista.sort(ordenar);
}

/** Tareas semanales (las de "esta semana", sin día fijo) de la semana de la fecha dada. */
export async function tareasSemanales(db: SQLiteDatabase, fecha = new Date()): Promise<TareaDelDia[]> {
  const rows = await db.getAllAsync<Tarea>(
    `SELECT * FROM tasks WHERE scope = 'semanal' AND due_date BETWEEN ? AND ? ORDER BY ${ORDEN_PRIORIDAD}, id`,
    toISODate(startOfWeek(fecha)),
    toISODate(endOfWeek(fecha)),
  );
  return rows.map((t) => ({ ...t, hecha: t.done === 1, atrasada: false })).sort(ordenar);
}

/** Todas las tareas (para la vista "Todas"): sin las de una vez ya hechas hace más de 7 días. */
export async function todasLasTareas(db: SQLiteDatabase): Promise<TareaDelDia[]> {
  const hoy = toISODate();
  const rows = await db.getAllAsync<Tarea>(
    `SELECT * FROM tasks
     WHERE NOT (repeat_type = 'none' AND done = 1 AND done_at < date('now','localtime','-7 days'))
     ORDER BY ${ORDEN_PRIORIDAD}, COALESCE(due_date, '9999'), id`,
  );
  return rows
    .map((t) => ({
      ...t,
      hecha: t.repeat_type === 'none' && t.done === 1,
      atrasada: t.repeat_type === 'none' && !!t.due_date && t.due_date < hoy && t.done === 0,
    }))
    .sort(ordenar);
}

export async function obtenerTarea(db: SQLiteDatabase, id: number): Promise<Tarea | null> {
  return db.getFirstAsync<Tarea>('SELECT * FROM tasks WHERE id = ?', id);
}

export async function crearTarea(db: SQLiteDatabase, t: NuevaTarea): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO tasks (title, notes, priority, scope, due_date, repeat_type, repeat_days)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    t.title.trim(),
    t.notes?.trim() || null,
    t.priority,
    t.scope,
    t.repeat_type === 'none' ? t.due_date : null,
    t.repeat_type,
    t.repeat_type === 'weekdays' ? t.repeat_days.sort().join(',') : null,
  );
  return r.lastInsertRowId;
}

export async function actualizarTarea(db: SQLiteDatabase, id: number, t: NuevaTarea): Promise<void> {
  await db.runAsync(
    `UPDATE tasks SET title = ?, notes = ?, priority = ?, scope = ?, due_date = ?, repeat_type = ?, repeat_days = ?
     WHERE id = ?`,
    t.title.trim(),
    t.notes?.trim() || null,
    t.priority,
    t.scope,
    t.repeat_type === 'none' ? t.due_date : null,
    t.repeat_type,
    t.repeat_type === 'weekdays' ? t.repeat_days.sort().join(',') : null,
    id,
  );
}

export async function eliminarTarea(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM tasks WHERE id = ?', id);
}

/**
 * Marca o desmarca una tarea.
 * - Una vez: cambia "done".
 * - Repetitiva: agrega o quita el registro de ese día en task_completions.
 */
export async function alternarTarea(
  db: SQLiteDatabase,
  t: Pick<Tarea, 'id' | 'repeat_type'>,
  hecha: boolean,
  fechaISO = toISODate(),
): Promise<void> {
  if (t.repeat_type === 'none') {
    await db.runAsync(
      `UPDATE tasks SET done = ?, done_at = CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE NULL END WHERE id = ?`,
      hecha ? 1 : 0,
      hecha ? 1 : 0,
      t.id,
    );
  } else if (hecha) {
    await db.runAsync('INSERT OR IGNORE INTO task_completions (task_id, date) VALUES (?, ?)', t.id, fechaISO);
  } else {
    await db.runAsync('DELETE FROM task_completions WHERE task_id = ? AND date = ?', t.id, fechaISO);
  }
}

/** Cuenta pendientes y hechas de hoy (lo usa la pantalla Hoy y las notificaciones). */
export async function conteoHoy(db: SQLiteDatabase): Promise<{ pendientes: number; hechas: number }> {
  const lista = await tareasDelDia(db, toISODate());
  const hechas = lista.filter((t) => t.hecha).length;
  return { pendientes: lista.length - hechas, hechas };
}

/** Tareas completadas en un rango de fechas (para el resumen semanal). */
export async function completadasEnRango(db: SQLiteDatabase, desdeISO: string, hastaISO: string): Promise<number> {
  const a = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks WHERE repeat_type = 'none' AND done = 1 AND date(done_at) BETWEEN ? AND ?`,
    desdeISO,
    hastaISO,
  );
  const b = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM task_completions WHERE date BETWEEN ? AND ?',
    desdeISO,
    hastaISO,
  );
  return (a?.n ?? 0) + (b?.n ?? 0);
}

/** Texto corto que describe cuándo toca la tarea: "Todos los días", "Lun, Jue", "Mañana"… */
export function describirCuando(t: Pick<Tarea, 'repeat_type' | 'repeat_days' | 'due_date' | 'scope'>): string | null {
  const CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  if (t.repeat_type === 'daily') return 'Todos los días';
  if (t.repeat_type === 'weekdays') {
    const dias = (t.repeat_days ?? '').split(',').filter(Boolean).map(Number);
    if (dias.length === 5 && dias.every((d) => d <= 5)) return 'Lunes a viernes';
    return dias.map((d) => CORTOS[d]).join(', ');
  }
  if (t.scope === 'semanal') return 'Esta semana';
  if (!t.due_date) return null;
  const hoy = toISODate();
  const manana = toISODate(new Date(Date.now() + 86400000));
  if (t.due_date === hoy) return 'Hoy';
  if (t.due_date === manana) return 'Mañana';
  const d = fromISODate(t.due_date);
  return `${CORTOS[weekdayMonFirst(d)]} ${d.getDate()}/${d.getMonth() + 1}`;
}
