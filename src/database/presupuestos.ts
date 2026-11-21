/**
 * Presupuesto mensual por categoría, gastos posiblemente repetidos y exportación a CSV.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { buscarDuplicados, clavePar, type GastoSimple, type ParDuplicado } from '@/finanzas/duplicados';
import { toISODate } from '@/utils/fechas';

export type AvanceCategoria = { category: string; limite: number; gastado: number };

function rangoMes(hoy: Date) {
  return {
    desde: toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: toISODate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  };
}

/** Límite y gasto del mes de cada categoría (incluye las que tienen gasto pero no límite). */
export async function avancePorCategoria(db: SQLiteDatabase, hoy = new Date()): Promise<AvanceCategoria[]> {
  const { desde, hasta } = rangoMes(hoy);
  const [limites, gastos] = await Promise.all([
    db.getAllAsync<{ category: string; monthly: number }>('SELECT category, monthly FROM category_budgets'),
    db.getAllAsync<{ category: string; t: number }>('SELECT category, SUM(amount) AS t FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category', desde, hasta),
  ]);
  const mapa = new Map<string, AvanceCategoria>();
  for (const l of limites) mapa.set(l.category, { category: l.category, limite: l.monthly, gastado: 0 });
  for (const g of gastos) {
    const x = mapa.get(g.category);
    if (x) x.gastado = g.t;
    else mapa.set(g.category, { category: g.category, limite: 0, gastado: g.t });
  }
  return [...mapa.values()];
}

/** Guarda el límite mensual de una categoría (0 = sin límite). */
export async function guardarPresupuesto(db: SQLiteDatabase, categoria: string, monto: number) {
  const m = Math.round(monto);
  if (m <= 0) await db.runAsync('DELETE FROM category_budgets WHERE category = ?', categoria);
  else
    await db.runAsync(
      'INSERT INTO category_budgets (category, monthly) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET monthly = excluded.monthly',
      categoria,
      m,
    );
}

// ---------- Repetidos ----------

/** Pares de gastos que parecen el mismo (últimos `dias` días). */
export async function posiblesDuplicados(db: SQLiteDatabase, dias = 45, hoy = new Date()): Promise<ParDuplicado[]> {
  const desde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias));
  const [gastos, ok] = await Promise.all([
    db.getAllAsync<GastoSimple>('SELECT id, amount, date, category, note FROM expenses WHERE date >= ? ORDER BY date', desde),
    db.getAllAsync<{ a: number; b: number }>('SELECT a, b FROM expense_pairs_ok'),
  ]);
  return buscarDuplicados(gastos, new Set(ok.map((p) => clavePar(p.a, p.b))));
}

/** "No es repetido": ese par no se vuelve a mostrar. */
export async function marcarNoDuplicado(db: SQLiteDatabase, a: number, b: number) {
  await db.runAsync('INSERT OR IGNORE INTO expense_pairs_ok (a, b) VALUES (?, ?)', Math.min(a, b), Math.max(a, b));
}

/** ¿Ya hay un gasto con el mismo monto ese día o el anterior/siguiente? (para avisar antes de guardar) */
export async function hayGastoParecido(db: SQLiteDatabase, monto: number, fecha: string, exceptoId: number | null = null): Promise<GastoSimple | null> {
  const [y, m, d] = fecha.split('-').map(Number);
  const antes = toISODate(new Date(y, m - 1, d - 1));
  const despues = toISODate(new Date(y, m - 1, d + 1));
  return db.getFirstAsync<GastoSimple>(
    'SELECT id, amount, date, category, note FROM expenses WHERE amount = ? AND date BETWEEN ? AND ? AND id != ? ORDER BY date DESC LIMIT 1',
    Math.round(monto),
    antes,
    despues,
    exceptoId ?? -1,
  );
}

/** Gastos de un rango para exportar. */
export async function gastosDelRango(db: SQLiteDatabase, desde: string, hasta: string): Promise<GastoSimple[]> {
  return db.getAllAsync<GastoSimple>('SELECT id, amount, date, category, note FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date, id', desde, hasta);
}
