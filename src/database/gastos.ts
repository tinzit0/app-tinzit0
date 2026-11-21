/**
 * Gastos: guardar, editar, borrar y calcular totales.
 * Los montos se guardan como enteros (CLP no tiene decimales).
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { endOfWeek, startOfWeek, toISODate } from '@/utils/fechas';
import { getSetting } from './queries';

export type Gasto = {
  id: number;
  amount: number;
  category: string;
  note: string | null;
  date: string;
  created_at: string;
};

export type NuevoGasto = { amount: number; category: string; note?: string | null; date: string };

export type Rango = { desde: string; hasta: string };

export function rangoSemana(fecha = new Date()): Rango {
  return { desde: toISODate(startOfWeek(fecha)), hasta: toISODate(endOfWeek(fecha)) };
}

export function rangoMes(fecha = new Date()): Rango {
  const desde = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const hasta = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
  return { desde: toISODate(desde), hasta: toISODate(hasta) };
}

/** Semana anterior a la de la fecha dada. */
export function rangoSemanaAnterior(fecha = new Date()): Rango {
  const d = new Date(fecha);
  d.setDate(d.getDate() - 7);
  return rangoSemana(d);
}

export async function crearGasto(db: SQLiteDatabase, g: NuevoGasto): Promise<number> {
  const r = await db.runAsync(
    'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?)',
    Math.round(g.amount),
    g.category,
    g.note?.trim() || null,
    g.date,
  );
  return r.lastInsertRowId;
}

export async function actualizarGasto(db: SQLiteDatabase, id: number, g: NuevoGasto): Promise<void> {
  await db.runAsync(
    'UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?',
    Math.round(g.amount),
    g.category,
    g.note?.trim() || null,
    g.date,
    id,
  );
}

export async function eliminarGasto(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', id);
}

export async function obtenerGasto(db: SQLiteDatabase, id: number): Promise<Gasto | null> {
  return db.getFirstAsync<Gasto>('SELECT * FROM expenses WHERE id = ?', id);
}

export async function gastosEnRango(db: SQLiteDatabase, r: Rango): Promise<Gasto[]> {
  return db.getAllAsync<Gasto>(
    'SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC',
    r.desde,
    r.hasta,
  );
}

export async function totalEnRango(db: SQLiteDatabase, r: Rango): Promise<number> {
  const row = await db.getFirstAsync<{ t: number | null }>(
    'SELECT SUM(amount) AS t FROM expenses WHERE date BETWEEN ? AND ?',
    r.desde,
    r.hasta,
  );
  return row?.t ?? 0;
}

export async function totalPorCategoria(
  db: SQLiteDatabase,
  r: Rango,
): Promise<{ category: string; total: number }[]> {
  return db.getAllAsync(
    `SELECT category, SUM(amount) AS total FROM expenses
     WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC`,
    r.desde,
    r.hasta,
  );
}

export async function presupuestoSemanal(db: SQLiteDatabase): Promise<number> {
  return Number((await getSetting(db, 'presupuesto_semanal')) ?? 0) || 0;
}

/**
 * Revisa si un gasto nuevo hizo cruzar el 80% o el 100% del presupuesto.
 * Devuelve un mensaje para mostrar, o null si no hay nada que avisar.
 */
export function avisoPresupuesto(antes: number, despues: number, presupuesto: number): string | null {
  if (presupuesto <= 0) return null;
  const a = antes / presupuesto;
  const d = despues / presupuesto;
  if (a < 1 && d >= 1) return 'Te pasaste del presupuesto de la semana 😬 Pisa el freno hasta el lunes.';
  if (a < 0.8 && d >= 0.8) return 'Ojo: ya llevas más del 80% del presupuesto semanal. Vamos con calma 👀';
  return null;
}

/** El último gasto anotado (para "borra el último gasto"). */
export async function ultimoGasto(db: SQLiteDatabase): Promise<Gasto | null> {
  return db.getFirstAsync<Gasto>('SELECT * FROM expenses ORDER BY id DESC LIMIT 1');
}
