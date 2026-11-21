/**
 * Gastos automáticos (avisos del banco) y proyección de gastos.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { esAppDeBanco, interpretarAviso, nombreBanco, type AvisoBanco } from '@/finanzas/banco';
import { proyectar, type Proyeccion } from '@/finanzas/proyeccion';
import { toISODate } from '@/utils/fechas';
import { crearGasto, presupuestoSemanal, rangoMes, rangoSemana, totalEnRango } from './gastos';
import { getSetting } from './queries';

export type AvisoGuardado = {
  id: number;
  pkg: string;
  title: string;
  text: string;
  ts: number;
  tipo: 'compra' | 'transferencia' | 'ignorar';
  monto: number | null;
  comercio: string | null;
  categoria: string | null;
  estado: 'pendiente' | 'agregado' | 'descartado' | 'ignorado';
  expense_id: number | null;
};

export type ModoAuto = 'preguntar' | 'auto';

export async function modoGastosAuto(db: SQLiteDatabase): Promise<ModoAuto> {
  return (await getSetting(db, 'gastos_auto_modo')) === 'auto' ? 'auto' : 'preguntar';
}

function notaDe(a: Pick<AvisoGuardado, 'comercio' | 'pkg'>) {
  return `${a.comercio ?? 'Compra'} · ${nombreBanco(a.pkg)}`;
}

/**
 * Guarda los avisos nuevos y, si el modo es "anotar solo", crea los gastos.
 * Las transferencias siempre quedan para revisar (pueden no ser gastos).
 */
export async function procesarAvisos(db: SQLiteDatabase, avisos: AvisoBanco[]): Promise<{ agregados: number; pendientes: number }> {
  const modo = await modoGastosAuto(db);
  let agregados = 0;
  let pendientes = 0;
  for (const a of avisos) {
    if (!a?.pkg || !esAppDeBanco(a.pkg)) continue;
    const r = interpretarAviso(a);
    const monto = r.tipo === 'ignorar' ? null : r.monto;
    const comercio = r.tipo === 'ignorar' ? null : r.comercio;
    const categoria = r.tipo === 'ignorar' ? null : r.categoria;
    const estado = r.tipo === 'ignorar' ? 'ignorado' : r.tipo === 'compra' && modo === 'auto' ? 'agregado' : 'pendiente';
    const ins = await db.runAsync(
      `INSERT OR IGNORE INTO bank_alerts (pkg, title, text, ts, tipo, monto, comercio, categoria, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.pkg,
      a.title ?? '',
      a.text ?? '',
      a.ts,
      r.tipo,
      monto,
      comercio,
      categoria,
      estado,
    );
    if (!ins.changes) continue; // ya lo habíamos visto
    if (estado === 'agregado' && monto) {
      const gid = await crearGasto(db, { amount: monto, category: categoria ?? 'otros', note: notaDe({ comercio, pkg: a.pkg }), date: toISODate(new Date(a.ts)) });
      await db.runAsync('UPDATE bank_alerts SET expense_id = ? WHERE id = ?', gid, ins.lastInsertRowId);
      agregados++;
    } else if (estado === 'pendiente') pendientes++;
  }
  return { agregados, pendientes };
}

export async function listarAvisos(db: SQLiteDatabase, estados: AvisoGuardado['estado'][], limite = 50): Promise<AvisoGuardado[]> {
  return db.getAllAsync<AvisoGuardado>(
    `SELECT * FROM bank_alerts WHERE estado IN (${estados.map(() => '?').join(',')}) ORDER BY ts DESC LIMIT ?`,
    ...estados,
    limite,
  );
}

export async function contarAvisosPendientes(db: SQLiteDatabase): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM bank_alerts WHERE estado = 'pendiente'"))?.n ?? 0;
}

/** Convierte un aviso pendiente en gasto. */
export async function aceptarAviso(db: SQLiteDatabase, id: number, categoria?: string): Promise<number | null> {
  const a = await db.getFirstAsync<AvisoGuardado>('SELECT * FROM bank_alerts WHERE id = ?', id);
  if (!a || !a.monto || a.estado === 'agregado') return null;
  const gid = await crearGasto(db, { amount: a.monto, category: categoria ?? a.categoria ?? 'otros', note: notaDe(a), date: toISODate(new Date(a.ts)) });
  await db.runAsync("UPDATE bank_alerts SET estado = 'agregado', expense_id = ?, categoria = ? WHERE id = ?", gid, categoria ?? a.categoria, id);
  return gid;
}

export async function descartarAviso(db: SQLiteDatabase, id: number) {
  await db.runAsync("UPDATE bank_alerts SET estado = 'descartado' WHERE id = ?", id);
}

// ---------- Proyección ----------

export async function obtenerProyeccion(db: SQLiteDatabase, hoy = new Date()): Promise<Proyeccion> {
  const hoyIso = toISODate(hoy);
  const ayer = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1));
  const semana = rangoSemana(hoy);
  const mes = rangoMes(hoy);
  const mesAnterior = rangoMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
  const ym = hoyIso.slice(0, 7);
  const [pres, antesDeHoy, deHoy, delMes, anterior, cobrados, pendientes] = await Promise.all([
    presupuestoSemanal(db),
    semana.desde <= ayer ? totalEnRango(db, { desde: semana.desde, hasta: ayer }) : Promise.resolve(0),
    totalEnRango(db, { desde: hoyIso, hasta: hoyIso }),
    totalEnRango(db, { desde: mes.desde, hasta: hoyIso }),
    totalEnRango(db, mesAnterior),
    db.getFirstAsync<{ t: number | null }>(
      'SELECT SUM(e.amount) AS t FROM fixed_payments p JOIN expenses e ON e.id = p.expense_id WHERE p.month = ?',
      ym,
    ),
    db.getFirstAsync<{ t: number | null }>(
      `SELECT SUM(f.amount) AS t FROM fixed_expenses f
       WHERE f.active = 1 AND NOT EXISTS (SELECT 1 FROM fixed_payments p WHERE p.fixed_id = f.id AND p.month = ?)`,
      ym,
    ),
  ]);
  return proyectar({
    hoy,
    presupuestoSemanal: pres,
    gastoSemanaAntesDeHoy: antesDeHoy,
    gastoHoy: deHoy,
    gastoMes: delMes,
    fijosCobradosMes: cobrados?.t ?? 0,
    fijosPendientesMes: pendientes?.t ?? 0,
    gastoMesAnterior: anterior,
  });
}
