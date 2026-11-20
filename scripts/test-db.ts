/**
 * Prueba rápida de la base de datos SIN celular: corre las consultas reales
 * de src/database sobre SQLite de Node. Uso:  npx tsx scripts/test-db.ts
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

import { migrateDb } from '../src/database/schema';
import * as tareas from '../src/database/tareas';
import * as gastos from '../src/database/gastos';
import * as gym from '../src/database/gym';
import * as notas from '../src/database/notas';
import { getResumenHoy } from '../src/database/queries';
import { toISODate, endOfWeek } from '../src/utils/fechas';

/** Imita la API async de expo-sqlite usando node:sqlite. */
function crearDb() {
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

async function main() {
  const db = crearDb();
  await migrateDb(db);
  await migrateDb(db); // dos veces: no debe fallar
  const hoy = toISODate();

  // Tareas
  const t1 = await tareas.crearTarea(db, { title: 'Pan', priority: 'alta', scope: 'diaria', due_date: hoy, repeat_type: 'none', repeat_days: [] });
  await tareas.crearTarea(db, { title: 'Agua', priority: 'baja', scope: 'diaria', due_date: null, repeat_type: 'daily', repeat_days: [] });
  await tareas.crearTarea(db, { title: 'Semanal', priority: 'media', scope: 'semanal', due_date: toISODate(endOfWeek()), repeat_type: 'none', repeat_days: [] });
  let lista = await tareas.tareasDelDia(db, hoy);
  assert.equal(lista.length, 2);
  await tareas.alternarTarea(db, { id: t1, repeat_type: 'none' }, true);
  const agua = lista.find((t) => t.title === 'Agua')!;
  await tareas.alternarTarea(db, agua, true, hoy);
  assert.deepEqual(await tareas.conteoHoy(db), { pendientes: 0, hechas: 2 });
  assert.equal((await tareas.tareasSemanales(db)).length, 1);
  assert.equal(await tareas.completadasEnRango(db, hoy, hoy), 2);

  // Gastos
  await gastos.crearGasto(db, { amount: 5000, category: 'comida', date: hoy });
  await gastos.crearGasto(db, { amount: 2500, category: 'transporte', note: 'micro', date: hoy });
  assert.equal(await gastos.totalEnRango(db, gastos.rangoSemana()), 7500);
  assert.equal((await gastos.totalPorCategoria(db, gastos.rangoMes()))[0].category, 'comida');
  assert.ok(gastos.avisoPresupuesto(70000, 85000, 100000));
  assert.equal(gastos.avisoPresupuesto(10, 20, 100000), null);

  // Gym
  await gym.guardarDiaRutina(db, 1, 'Pecho');
  const ex = await gym.obtenerOCrearEjercicio(db, 'Press banca');
  assert.equal(await gym.obtenerOCrearEjercicio(db, 'press  BANCA'), ex);
  await gym.agregarSerie(db, ex, hoy, 10, 40);
  await gym.agregarSerie(db, ex, hoy, 8, 45);
  const hist = await gym.historialEjercicio(db, ex);
  assert.equal(hist[0].maxPeso, 45);
  assert.equal(await gym.diasEntrenados(db, gastos.rangoSemana()), 1);

  // Notas
  const n = await notas.guardarNota(db, null, 'Hola\nmundo');
  assert.ok(n);
  assert.equal(await notas.guardarNota(db, n, '   '), null);
  assert.equal((await notas.listarNotas(db)).length, 0);

  const r = await getResumenHoy(db);
  assert.equal(r.gastoSemana, 7500);
  console.log('✅ Todas las pruebas de base de datos pasaron');
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
