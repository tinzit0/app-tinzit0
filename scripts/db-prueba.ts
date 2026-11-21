/**
 * Base de datos de prueba en memoria (node:sqlite) con la misma API que expo-sqlite.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrateDb } from '../src/database/schema';

/** Imita la API async de expo-sqlite usando node:sqlite. */
export function crearDb() {
  const raw = new DatabaseSync(':memory:');
  const args = (p: unknown[]) => (p.length === 1 && typeof p[0] === 'object' && p[0] !== null ? p[0] : p);
  const prep = (sql: string, p: unknown[]) => {
    const st = raw.prepare(sql);
    const a = args(p);
    return { st, a };
  };
  const call = (st: any, m: string, a: any) => (Array.isArray(a) ? st[m](...a) : st[m](a));
  const db: any = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...p: unknown[]) => {
      const { st, a } = prep(sql, p);
      const r = call(st, 'run', a);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllAsync: async (sql: string, ...p: unknown[]) => {
      const { st, a } = prep(sql, p);
      return call(st, 'all', a).map((r: any) => ({ ...r }));
    },
    getFirstAsync: async (sql: string, ...p: unknown[]) => {
      const { st, a } = prep(sql, p);
      const r = call(st, 'get', a);
      return r ? { ...r } : null;
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      raw.exec('BEGIN');
      try { await fn(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
  db.withExclusiveTransactionAsync = async (fn: (tx: any) => Promise<void>) => db.withTransactionAsync(() => fn(db));
  return db;
}


export async function crearDbPrueba() {
  const db = crearDb();
  await migrateDb(db);
  return db;
}
