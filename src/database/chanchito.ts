/**
 * Chanchito: una alcancía aparte de las metas de ahorro (tabla piggy_movements, migración v15).
 * Lo ahorrado es la suma de los movimientos: echar plata suma, sacar resta.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { toISODate } from '@/utils/fechas';
import { getSetting, setSetting } from './queries';
import { transaccion } from './tx';

export type Movimiento = { id: number; amount: number; note: string | null; date: string; created_at: string };

export async function totalChanchito(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM piggy_movements');
  return r?.total ?? 0;
}

export async function movimientosChanchito(db: SQLiteDatabase, limite = 50): Promise<Movimiento[]> {
  return db.getAllAsync<Movimiento>('SELECT * FROM piggy_movements ORDER BY date DESC, id DESC LIMIT ?', limite);
}

/** Echa plata al chanchito. */
export async function echarAlChanchito(db: SQLiteDatabase, monto: number, nota?: string | null, fecha = toISODate()): Promise<void> {
  const m = Math.round(monto);
  if (!(m > 0)) throw new Error('El monto tiene que ser mayor a cero.');
  await db.runAsync('INSERT INTO piggy_movements (amount, note, date) VALUES (?, ?, ?)', m, nota?.trim() || null, fecha);
}

/** Saca plata (nunca más de lo que hay). Devuelve lo que realmente sacó. */
export async function sacarDelChanchito(db: SQLiteDatabase, monto: number, nota?: string | null, fecha = toISODate()): Promise<number> {
  return transaccion(db, async (tx) => {
    const total = await totalChanchito(tx);
    const m = Math.min(Math.round(monto), total);
    if (!(m > 0)) return 0;
    await tx.runAsync('INSERT INTO piggy_movements (amount, note, date) VALUES (?, ?, ?)', -m, nota?.trim() || null, fecha);
    return m;
  });
}

export async function eliminarMovimiento(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM piggy_movements WHERE id = ?', id);
}

/** Meta opcional del chanchito (0 = sin meta). */
export async function metaChanchito(db: SQLiteDatabase): Promise<number> {
  return Number((await getSetting(db, 'chanchito_meta')) ?? 0) || 0;
}

export async function ponerMetaChanchito(db: SQLiteDatabase, monto: number) {
  await setSetting(db, 'chanchito_meta', String(Math.max(0, Math.round(monto))));
}

/** Cuánto echaste este mes (para mostrar el avance del mes). */
export async function echadoEnMes(db: SQLiteDatabase, hoy = new Date()): Promise<number> {
  const desde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const r = await db.getFirstAsync<{ t: number }>('SELECT COALESCE(SUM(amount), 0) AS t FROM piggy_movements WHERE amount > 0 AND date >= ?', desde);
  return r?.t ?? 0;
}
