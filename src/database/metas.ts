/**
 * Metas de ahorro: nombre, monto objetivo, fecha límite opcional y abonos.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { toISODate } from '@/utils/fechas';

export type Meta = {
  id: number;
  name: string;
  target: number;
  deadline: string | null;
  created_at: string;
  ahorrado: number;
};

export type NuevaMeta = { name: string; target: number; deadline: string | null };

export async function listarMetas(db: SQLiteDatabase): Promise<Meta[]> {
  return db.getAllAsync<Meta>(
    `SELECT g.*, COALESCE((SELECT SUM(amount) FROM goal_contributions c WHERE c.goal_id = g.id), 0) AS ahorrado
     FROM savings_goals g
     ORDER BY (ahorrado >= g.target), COALESCE(g.deadline, '9999'), g.id`,
  );
}

export async function obtenerMeta(db: SQLiteDatabase, id: number): Promise<Meta | null> {
  return db.getFirstAsync<Meta>(
    `SELECT g.*, COALESCE((SELECT SUM(amount) FROM goal_contributions c WHERE c.goal_id = g.id), 0) AS ahorrado
     FROM savings_goals g WHERE g.id = ?`,
    id,
  );
}

/** Busca una meta por nombre aproximado (lo usa el asistente de voz). */
export async function buscarMeta(db: SQLiteDatabase, texto: string): Promise<Meta | null> {
  const metas = await listarMetas(db);
  if (metas.length === 1) return metas[0];
  const t = texto.toLowerCase();
  return metas.find((m) => t.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(t)) ?? null;
}

export async function crearMeta(db: SQLiteDatabase, m: NuevaMeta) {
  const r = await db.runAsync(
    'INSERT INTO savings_goals (name, target, deadline) VALUES (?, ?, ?)',
    m.name.trim(),
    Math.round(m.target),
    m.deadline,
  );
  return r.lastInsertRowId;
}

export async function actualizarMeta(db: SQLiteDatabase, id: number, m: NuevaMeta) {
  await db.runAsync(
    'UPDATE savings_goals SET name = ?, target = ?, deadline = ? WHERE id = ?',
    m.name.trim(),
    Math.round(m.target),
    m.deadline,
    id,
  );
}

export async function eliminarMeta(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM savings_goals WHERE id = ?', id);
}

/** Abonar (o retirar, con monto negativo) a una meta. */
export async function abonar(db: SQLiteDatabase, goalId: number, monto: number, fecha = toISODate()) {
  await db.runAsync(
    'INSERT INTO goal_contributions (goal_id, amount, date) VALUES (?, ?, ?)',
    goalId,
    Math.round(monto),
    fecha,
  );
}

export async function abonosDeMeta(db: SQLiteDatabase, goalId: number) {
  return db.getAllAsync<{ id: number; amount: number; date: string }>(
    'SELECT id, amount, date FROM goal_contributions WHERE goal_id = ? ORDER BY date DESC, id DESC',
    goalId,
  );
}

export async function eliminarAbono(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM goal_contributions WHERE id = ?', id);
}

/** Cuánto ahorrar por semana para llegar a tiempo (null si no tiene fecha o ya pasó). */
export function ahorroSemanalNecesario(m: Pick<Meta, 'target' | 'ahorrado' | 'deadline'>): number | null {
  if (!m.deadline) return null;
  const falta = m.target - m.ahorrado;
  if (falta <= 0) return 0;
  const dias = (new Date(`${m.deadline}T23:59:59`).getTime() - Date.now()) / 86400000;
  if (dias <= 0) return null;
  return Math.ceil(falta / Math.max(1, dias / 7));
}
