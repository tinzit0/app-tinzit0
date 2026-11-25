/**
 * Modo Estudiante en la base de datos: ramos, horario, evaluaciones, asistencia,
 * sesiones de estudio y tarjetas de memoria.
 * La lógica pura (promedios, plan, repetición espaciada) vive en src/estudio/logica.ts.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  buscarRamoPorNombre,
  formatoHoras,
  notaDeSubnotas,
  notaNecesaria,
  planEstudio,
  porcentajeAsistencia,
  promedio,
  repasar,
  type Calidad,
  type Necesaria,
  type TarjetaNueva,
} from '@/estudio/logica';
import { toISODate } from '@/utils/fechas';
import { transaccion } from './tx';

export const COLORES_RAMO = ['#CFF56B', '#38BDF8', '#F59E0B', '#A78BFA', '#34D399', '#F472B6', '#FB923C', '#EF4444', '#2DD4BF', '#94A3B8'];

export type Ramo = {
  id: number;
  name: string;
  color: string;
  teacher: string | null;
  room: string | null;
  passing: number;
  min_attendance: number;
};

export type TipoBloque = 'catedra' | 'ayudantia' | 'laboratorio';
export const TIPOS_BLOQUE: { value: TipoBloque; label: string; corto: string }[] = [
  { value: 'catedra', label: 'Cátedra', corto: 'Cát.' },
  { value: 'ayudantia', label: 'Ayudantía', corto: 'Ayud.' },
  { value: 'laboratorio', label: 'Laboratorio', corto: 'Lab.' },
];
export function nombreTipo(t: string | null | undefined, corto = false): string {
  const x = TIPOS_BLOQUE.find((k) => k.value === t) ?? TIPOS_BLOQUE[0];
  return corto ? x.corto : x.label;
}

export type Bloque = { id: number; course_id: number; weekday: number; start_time: string; end_time: string; room: string | null; kind: TipoBloque };
export type BloqueConRamo = Bloque & { name: string; color: string; sala: string | null };

export type Evaluacion = {
  id: number;
  course_id: number;
  name: string;
  weight: number;
  grade: number | null;
  date: string | null;
  study_hours: number;
  /** Si es una subnota: la evaluación a la que pertenece. */
  parent_id: number | null;
};
export type EvaluacionConRamo = Evaluacion & { ramo: string; color: string };

export type RamoResumen = Ramo & {
  promedio: number | null;
  necesaria: Necesaria;
  asistencia: number | null;
  clases: number;
  faltas: number;
  evaluaciones: number;
};

// ---------- Ramos ----------

export async function listarRamosSimple(db: SQLiteDatabase): Promise<Ramo[]> {
  return db.getAllAsync<Ramo>('SELECT * FROM courses WHERE archived = 0 ORDER BY name COLLATE NOCASE');
}

/** Todos los ramos con su resumen, con 3 consultas en total (no 2 por ramo). */
export async function listarRamos(db: SQLiteDatabase): Promise<RamoResumen[]> {
  const [ramos, evals, asis] = await Promise.all([
    listarRamosSimple(db),
    db.getAllAsync<Evaluacion>('SELECT * FROM evaluations WHERE parent_id IS NULL ORDER BY (date IS NULL), date, id'),
    db.getAllAsync<{ course_id: number; total: number; presentes: number }>(
      'SELECT course_id, COUNT(*) AS total, COALESCE(SUM(present), 0) AS presentes FROM attendance GROUP BY course_id',
    ),
  ]);
  const asisPor = new Map(asis.map((a) => [a.course_id, a]));
  return ramos.map((r) => armarResumen(r, evals.filter((e) => e.course_id === r.id), asisPor.get(r.id)));
}

function armarResumen(r: Ramo, evals: Evaluacion[], asis: { total: number; presentes: number } | undefined): RamoResumen {
  const total = asis?.total ?? 0;
  const presentes = asis?.presentes ?? 0;
  return {
    ...r,
    promedio: promedio(evals),
    necesaria: notaNecesaria(evals, r.passing),
    asistencia: porcentajeAsistencia(presentes, total),
    clases: total,
    faltas: total - presentes,
    evaluaciones: evals.length,
  };
}

export async function resumenRamo(db: SQLiteDatabase, r: Ramo): Promise<RamoResumen> {
  const evals = await evaluacionesDeRamo(db, r.id);
  const asis = await db.getFirstAsync<{ total: number; presentes: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(present), 0) AS presentes FROM attendance WHERE course_id = ?',
    r.id,
  );
  return armarResumen(r, evals, asis ?? undefined);
}

export async function obtenerRamo(db: SQLiteDatabase, id: number): Promise<Ramo | null> {
  return db.getFirstAsync<Ramo>('SELECT * FROM courses WHERE id = ?', id);
}

export type NuevoRamo = Omit<Ramo, 'id'>;

export async function crearRamo(db: SQLiteDatabase, r: NuevoRamo): Promise<number> {
  const x = await db.runAsync(
    'INSERT INTO courses (name, color, teacher, room, passing, min_attendance) VALUES (?, ?, ?, ?, ?, ?)',
    r.name.trim(),
    r.color,
    r.teacher?.trim() || null,
    r.room?.trim() || null,
    r.passing,
    r.min_attendance,
  );
  return x.lastInsertRowId;
}

export async function actualizarRamo(db: SQLiteDatabase, id: number, r: NuevoRamo) {
  await db.runAsync(
    'UPDATE courses SET name = ?, color = ?, teacher = ?, room = ?, passing = ?, min_attendance = ? WHERE id = ?',
    r.name.trim(),
    r.color,
    r.teacher?.trim() || null,
    r.room?.trim() || null,
    r.passing,
    r.min_attendance,
    id,
  );
}

export async function eliminarRamo(db: SQLiteDatabase, id: number) {
  await transaccion(db, async (tx) => {
    const evals = await tx.getAllAsync<{ id: number }>('SELECT id FROM evaluations WHERE course_id = ?', id);
    for (const e of evals) await borrarPlan(tx, e.id);
    await tx.runAsync('DELETE FROM courses WHERE id = ?', id);
  });
}

/** Busca un ramo por cómo lo nombraste ("cálculo" → "Cálculo I"). */
export async function buscarRamo(db: SQLiteDatabase, texto: string | null | undefined): Promise<Ramo | null> {
  if (!texto) return null;
  return buscarRamoPorNombre(await listarRamosSimple(db), texto);
}

// ---------- Horario ----------

export async function bloquesDeRamo(db: SQLiteDatabase, courseId: number): Promise<Bloque[]> {
  return db.getAllAsync<Bloque>('SELECT * FROM class_blocks WHERE course_id = ? ORDER BY weekday, start_time', courseId);
}

export async function todosLosBloques(db: SQLiteDatabase): Promise<BloqueConRamo[]> {
  return db.getAllAsync<BloqueConRamo>(
    `SELECT b.*, c.name, c.color, COALESCE(b.room, c.room) AS sala
     FROM class_blocks b JOIN courses c ON c.id = b.course_id
     WHERE c.archived = 0 ORDER BY b.weekday, b.start_time`,
  );
}

export type NuevoBloque = { weekday: number; start_time: string; end_time: string; room?: string | null; kind?: TipoBloque };

export async function obtenerBloque(db: SQLiteDatabase, id: number): Promise<Bloque | null> {
  return db.getFirstAsync<Bloque>('SELECT * FROM class_blocks WHERE id = ?', id);
}

/** Crea un bloque suelto (desde la Agenda). */
export async function crearBloque(db: SQLiteDatabase, courseId: number, b: NuevoBloque): Promise<number> {
  const r = await db.runAsync(
    'INSERT INTO class_blocks (course_id, weekday, start_time, end_time, room, kind) VALUES (?, ?, ?, ?, ?, ?)',
    courseId,
    b.weekday,
    b.start_time,
    b.end_time,
    b.room?.trim() || null,
    b.kind ?? 'catedra',
  );
  return r.lastInsertRowId;
}

export async function actualizarBloque(db: SQLiteDatabase, id: number, courseId: number, b: NuevoBloque) {
  await db.runAsync(
    'UPDATE class_blocks SET course_id = ?, weekday = ?, start_time = ?, end_time = ?, room = ?, kind = ? WHERE id = ?',
    courseId,
    b.weekday,
    b.start_time,
    b.end_time,
    b.room?.trim() || null,
    b.kind ?? 'catedra',
    id,
  );
}

export async function eliminarBloque(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM class_blocks WHERE id = ?', id);
}

export async function cambiarColorRamo(db: SQLiteDatabase, courseId: number, color: string) {
  await db.runAsync('UPDATE courses SET color = ? WHERE id = ?', color, courseId);
}

/** Reemplaza todos los bloques de un ramo (todo o nada: si falla, queda el horario anterior). */
export async function guardarBloques(db: SQLiteDatabase, courseId: number, bloques: NuevoBloque[]) {
  await transaccion(db, (tx) => guardarBloquesEn(tx, courseId, bloques));
}

async function guardarBloquesEn(db: SQLiteDatabase, courseId: number, bloques: NuevoBloque[]) {
  await db.runAsync('DELETE FROM class_blocks WHERE course_id = ?', courseId);
  for (const b of bloques) {
    await db.runAsync(
      'INSERT INTO class_blocks (course_id, weekday, start_time, end_time, room, kind) VALUES (?, ?, ?, ?, ?, ?)',
      courseId,
      b.weekday,
      b.start_time,
      b.end_time,
      b.room?.trim() || null,
      b.kind ?? 'catedra',
    );
  }
}

// ---------- Evaluaciones ----------

/** Evaluaciones del ramo (las que cuentan para el promedio; las subnotas van dentro de su evaluación). */
export async function evaluacionesDeRamo(db: SQLiteDatabase, courseId: number): Promise<Evaluacion[]> {
  return db.getAllAsync<Evaluacion>(
    'SELECT * FROM evaluations WHERE course_id = ? AND parent_id IS NULL ORDER BY (date IS NULL), date, id',
    courseId,
  );
}

/** Subnotas de una evaluación. */
export async function subnotasDe(db: SQLiteDatabase, parentId: number): Promise<Evaluacion[]> {
  return db.getAllAsync<Evaluacion>('SELECT * FROM evaluations WHERE parent_id = ? ORDER BY (date IS NULL), date, id', parentId);
}

/** Todas las subnotas de un ramo (para mostrarlas agrupadas). */
export async function subnotasDeRamo(db: SQLiteDatabase, courseId: number): Promise<Evaluacion[]> {
  return db.getAllAsync<Evaluacion>('SELECT * FROM evaluations WHERE course_id = ? AND parent_id IS NOT NULL ORDER BY (date IS NULL), date, id', courseId);
}

/** Evaluaciones a las que se les puede poner nota directo (todas menos las que se calculan con subnotas). */
export async function evaluacionesConNotaDirecta(db: SQLiteDatabase, courseId: number): Promise<Evaluacion[]> {
  return db.getAllAsync<Evaluacion>(
    `SELECT * FROM evaluations e WHERE course_id = ?
       AND NOT EXISTS (SELECT 1 FROM evaluations s WHERE s.parent_id = e.id)
     ORDER BY (date IS NULL), date, id`,
    courseId,
  );
}

/** Recalcula la nota de una evaluación a partir de sus subnotas (si tiene). */
async function recalcularPadre(db: SQLiteDatabase, parentId: number | null | undefined) {
  if (!parentId) return;
  const subs = await subnotasDe(db, parentId);
  if (!subs.length) return;
  const { nota } = notaDeSubnotas(subs);
  await db.runAsync('UPDATE evaluations SET grade = ? WHERE id = ?', nota, parentId);
  // Con la nota completa ya no hace falta seguir el plan de estudio de la evaluación grande.
  if (nota != null) await borrarPlan(db, parentId);
}

export async function obtenerEvaluacion(db: SQLiteDatabase, id: number): Promise<Evaluacion | null> {
  return db.getFirstAsync<Evaluacion>('SELECT * FROM evaluations WHERE id = ?', id);
}

/** Pruebas con fecha desde hoy hasta `dias` días más. */
export async function proximasEvaluaciones(db: SQLiteDatabase, dias = 30, desde = new Date()): Promise<EvaluacionConRamo[]> {
  const hasta = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias);
  return db.getAllAsync<EvaluacionConRamo>(
    `SELECT e.*, c.name AS ramo, c.color FROM evaluations e JOIN courses c ON c.id = e.course_id
     WHERE e.date IS NOT NULL AND e.date >= ? AND e.date <= ? AND c.archived = 0
     ORDER BY e.date, e.id`,
    toISODate(desde),
    toISODate(hasta),
  );
}

export type NuevaEvaluacion = Omit<Evaluacion, 'id' | 'parent_id'> & { parent_id?: number | null };

/** Crea la evaluación y su plan de estudio juntos (si algo falla, no queda nada a medias). */
export async function crearEvaluacion(db: SQLiteDatabase, e: NuevaEvaluacion, hoy = new Date()): Promise<number> {
  return transaccion(db, async (tx) => {
    const padre = e.parent_id ? await obtenerEvaluacion(tx, e.parent_id) : null;
    const x = await tx.runAsync(
      'INSERT INTO evaluations (course_id, name, weight, grade, date, study_hours, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      padre?.course_id ?? e.course_id,
      e.name.trim(),
      e.weight,
      e.grade,
      e.date,
      e.study_hours,
      padre?.id ?? null,
    );
    await rehacerPlanEn(tx, x.lastInsertRowId, hoy);
    await recalcularPadre(tx, padre?.id);
    return x.lastInsertRowId;
  });
}

export async function actualizarEvaluacion(db: SQLiteDatabase, id: number, e: NuevaEvaluacion, hoy = new Date()) {
  await transaccion(db, async (tx) => {
    await tx.runAsync(
      'UPDATE evaluations SET course_id = ?, name = ?, weight = ?, grade = ?, date = ?, study_hours = ? WHERE id = ?',
      e.course_id,
      e.name.trim(),
      e.weight,
      e.grade,
      e.date,
      e.study_hours,
      id,
    );
    // Si tiene subnotas, su nota la mandan ellas (no la que venga del formulario).
    await recalcularPadre(tx, id);
    await rehacerPlanEn(tx, id, hoy);
    await recalcularPadre(tx, (await obtenerEvaluacion(tx, id))?.parent_id);
  });
}

/** Pone (o cambia) solo la nota. */
export async function ponerNota(db: SQLiteDatabase, id: number, nota: number | null) {
  await transaccion(db, async (tx) => {
    await tx.runAsync('UPDATE evaluations SET grade = ? WHERE id = ?', nota, id);
    // Con nota puesta, ya no tiene sentido seguir estudiando para esa prueba.
    if (nota != null) await borrarPlan(tx, id);
    await recalcularPadre(tx, (await obtenerEvaluacion(tx, id))?.parent_id);
  });
}

export async function eliminarEvaluacion(db: SQLiteDatabase, id: number) {
  await transaccion(db, async (tx) => {
    const ev = await obtenerEvaluacion(tx, id);
    for (const s of await subnotasDe(tx, id)) await borrarPlan(tx, s.id);
    await borrarPlan(tx, id);
    await tx.runAsync('DELETE FROM evaluations WHERE parent_id = ?', id);
    await tx.runAsync('DELETE FROM evaluations WHERE id = ?', id);
    // Si quedan otras subnotas, la evaluación grande se recalcula; si era la última, vuelve a ser nota a mano.
    if (ev?.parent_id) await recalcularPadre(tx, ev.parent_id);
  });
}

async function borrarPlan(db: SQLiteDatabase, evaluationId: number) {
  await db.runAsync('DELETE FROM tasks WHERE evaluation_id = ? AND done = 0', evaluationId);
}

/**
 * Plan de estudio: crea tareas "Estudiar X" repartidas hasta el día antes de la prueba.
 * Se rehace cada vez que cambias la fecha o las horas (las tareas ya hechas se respetan).
 */
export async function rehacerPlan(db: SQLiteDatabase, evaluationId: number, hoy = new Date()): Promise<number> {
  return transaccion(db, (tx) => rehacerPlanEn(tx, evaluationId, hoy));
}

async function rehacerPlanEn(db: SQLiteDatabase, evaluationId: number, hoy = new Date()): Promise<number> {
  await borrarPlan(db, evaluationId);
  const e = await obtenerEvaluacion(db, evaluationId);
  if (!e || !e.date || !(e.study_hours > 0) || e.grade != null) return 0;
  if (e.date < toISODate(hoy)) return 0;
  const ramo = await obtenerRamo(db, e.course_id);
  const hechas = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tasks WHERE evaluation_id = ? AND done = 1', evaluationId);
  const plan = planEstudio(e.study_hours, e.date, hoy);
  let n = 0;
  for (const b of plan.slice(hechas?.n ?? 0)) {
    const r = await db.runAsync(
      `INSERT INTO tasks (title, notes, priority, scope, due_date, repeat_type, repeat_days, evaluation_id)
       VALUES (?, ?, ?, 'diaria', ?, 'none', NULL, ?)`,
      `📚 Estudiar ${ramo?.name ?? ''} (${formatoHoras(b.horas)})`,
      `Para: ${e.name} · ${e.date}`,
      diasEntre(b.fecha, e.date) <= 2 ? 'alta' : 'media',
      b.fecha,
      evaluationId,
    );
    if (r.lastInsertRowId) n++;
  }
  return n;
}

function diasEntre(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

// ---------- Asistencia ----------

export async function marcarAsistencia(db: SQLiteDatabase, courseId: number, presente: boolean, fecha = toISODate()) {
  await db.runAsync(
    'INSERT INTO attendance (course_id, date, present) VALUES (?, ?, ?) ON CONFLICT(course_id, date) DO UPDATE SET present = excluded.present',
    courseId,
    fecha,
    presente ? 1 : 0,
  );
}

export async function quitarAsistencia(db: SQLiteDatabase, courseId: number, fecha = toISODate()) {
  await db.runAsync('DELETE FROM attendance WHERE course_id = ? AND date = ?', courseId, fecha);
}

export async function asistenciaDeRamo(db: SQLiteDatabase, courseId: number): Promise<{ date: string; present: number }[]> {
  return db.getAllAsync('SELECT date, present FROM attendance WHERE course_id = ? ORDER BY date DESC', courseId);
}

// ---------- Sesiones de estudio ----------

export async function registrarEstudio(db: SQLiteDatabase, courseId: number | null, minutos: number, fecha = toISODate()) {
  if (minutos < 1) return;
  await db.runAsync('INSERT INTO study_sessions (course_id, date, minutes) VALUES (?, ?, ?)', courseId, fecha, Math.round(minutos));
}

/**
 * Registra un bloque de Pomodoro UNA sola vez (aunque se llame dos veces: al volver a la app,
 * desde dos pantallas, etc.). El id del último bloque registrado se guarda en la misma transacción.
 */
export async function registrarBloque(db: SQLiteDatabase, bloqueId: string, courseId: number | null, minutos: number): Promise<boolean> {
  if (minutos < 1) return false;
  return transaccion(db, async (tx) => {
    const previo = await tx.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'pomodoro_registrados'");
    const ids = (previo?.value ?? '').split(',').filter(Boolean);
    if (ids.includes(bloqueId)) return false;
    await tx.runAsync('INSERT INTO study_sessions (course_id, date, minutes) VALUES (?, ?, ?)', courseId, toISODate(), Math.round(minutos));
    await tx.runAsync(
      "INSERT INTO settings (key, value) VALUES ('pomodoro_registrados', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [...ids, bloqueId].slice(-20).join(','),
    );
    return true;
  });
}

export async function minutosEstudio(db: SQLiteDatabase, desde: string, hasta: string): Promise<{ total: number; porRamo: { name: string; color: string; minutos: number }[] }> {
  const porRamo = await db.getAllAsync<{ name: string; color: string; minutos: number }>(
    `SELECT COALESCE(c.name, 'General') AS name, COALESCE(c.color, '#94A3B8') AS color, SUM(s.minutes) AS minutos
     FROM study_sessions s LEFT JOIN courses c ON c.id = s.course_id
     WHERE s.date >= ? AND s.date <= ? GROUP BY s.course_id ORDER BY minutos DESC`,
    desde,
    hasta,
  );
  return { total: porRamo.reduce((s, r) => s + r.minutos, 0), porRamo };
}

// ---------- Tarjetas ----------

export type Tarjeta = {
  id: number;
  course_id: number | null;
  front: string;
  back: string;
  ease: number;
  interval: number;
  reps: number;
  due: string;
};

export async function crearTarjetas(db: SQLiteDatabase, courseId: number | null, tarjetas: TarjetaNueva[]): Promise<number> {
  let n = 0;
  for (const t of tarjetas) {
    if (!t.front.trim() || !t.back.trim()) continue;
    await db.runAsync('INSERT INTO flashcards (course_id, front, back, due) VALUES (?, ?, ?, ?)', courseId, t.front.trim(), t.back.trim(), toISODate());
    n++;
  }
  return n;
}

export async function actualizarTarjeta(db: SQLiteDatabase, id: number, t: TarjetaNueva) {
  await db.runAsync('UPDATE flashcards SET front = ?, back = ? WHERE id = ?', t.front.trim(), t.back.trim(), id);
}

export async function eliminarTarjeta(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM flashcards WHERE id = ?', id);
}

/** courseId: undefined = todas · null = sin ramo · número = ese ramo. */
function filtroRamo(courseId: number | null | undefined): [string, (number | string)[]] {
  if (courseId === undefined) return ['1 = 1', []];
  if (courseId === null) return ['course_id IS NULL', []];
  return ['course_id = ?', [courseId]];
}

export async function listarTarjetas(db: SQLiteDatabase, courseId?: number | null): Promise<Tarjeta[]> {
  const [w, p] = filtroRamo(courseId);
  return db.getAllAsync<Tarjeta>(`SELECT * FROM flashcards WHERE ${w} ORDER BY id DESC`, ...p);
}

export async function tarjetasParaHoy(db: SQLiteDatabase, courseId?: number | null, hoy = toISODate()): Promise<Tarjeta[]> {
  const [w, p] = filtroRamo(courseId);
  return db.getAllAsync<Tarjeta>(`SELECT * FROM flashcards WHERE ${w} AND due <= ? ORDER BY due, reps, id`, ...p, hoy);
}

export async function contarPendientes(db: SQLiteDatabase, hoy = toISODate()): Promise<{ course_id: number | null; pendientes: number; total: number }[]> {
  return db.getAllAsync(
    'SELECT course_id, SUM(CASE WHEN due <= ? THEN 1 ELSE 0 END) AS pendientes, COUNT(*) AS total FROM flashcards GROUP BY course_id',
    hoy,
  );
}

export async function guardarRepaso(db: SQLiteDatabase, t: Tarjeta, calidad: Calidad) {
  const r = repasar(t, calidad);
  await db.runAsync('UPDATE flashcards SET ease = ?, interval = ?, reps = ?, due = ? WHERE id = ?', r.ease, r.interval, r.reps, r.due, t.id);
}
