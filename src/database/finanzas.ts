/**
 * Gastos automáticos (avisos del banco) y proyección de gastos.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { esAppDeBanco, interpretarAviso, nombreBanco, type AvisoBanco } from '@/finanzas/banco';
import { proyectar, type Proyeccion } from '@/finanzas/proyeccion';
import { toISODate } from '@/utils/fechas';
import { crearGasto, presupuestoSemanal, rangoMes, rangoSemana, totalEnRango } from './gastos';
import { getSetting } from './queries';
import { transaccion } from './tx';

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
export type ResultadoAvisos = {
  agregados: number;
  pendientes: number;
  /** Avisos que ya quedaron guardados (o que se descartan por no ser de un banco): se pueden quitar de la cola. */
  procesados: AvisoBanco[];
  /** Avisos que fallaron al guardarse: se quedan en la cola para reintentar. */
  fallidos: number;
};

/** Guarda UN aviso (y su gasto, si corresponde) en una sola transacción: queda todo o nada. */
async function guardarAviso(db: SQLiteDatabase, a: AvisoBanco, modo: ModoAuto): Promise<'agregado' | 'pendiente' | 'otro'> {
  const r = interpretarAviso(a);
  const monto = r.tipo === 'ignorar' ? null : r.monto;
  const comercio = r.tipo === 'ignorar' ? null : r.comercio;
  const categoria = r.tipo === 'ignorar' ? null : r.categoria;
  const estado = r.tipo === 'ignorar' ? 'ignorado' : r.tipo === 'compra' && modo === 'auto' ? 'agregado' : 'pendiente';
  return transaccion(db, async (tx) => {
    // UNIQUE(pkg, ts, text): el mismo aviso leído dos veces (reintento) no se duplica.
    // Dos compras iguales de verdad tienen distinta hora (ts), así que se guardan las dos.
    const ins = await tx.runAsync(
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
    if (!ins.changes) return 'otro'; // ya lo habíamos guardado antes
    if (estado === 'agregado' && monto) {
      const gid = await crearGasto(tx, { amount: monto, category: categoria ?? 'otros', note: notaDe({ comercio, pkg: a.pkg }), date: toISODate(new Date(a.ts)) });
      await tx.runAsync('UPDATE bank_alerts SET expense_id = ? WHERE id = ?', gid, ins.lastInsertRowId);
      return 'agregado';
    }
    return estado === 'pendiente' ? 'pendiente' : 'otro';
  });
}

/**
 * Guarda los avisos nuevos y, si el modo es "anotar solo", crea los gastos.
 * Las transferencias siempre quedan para revisar (pueden no ser gastos).
 * Cada aviso se guarda por separado: si uno falla, los demás no se pierden.
 */
export async function procesarAvisos(db: SQLiteDatabase, avisos: AvisoBanco[]): Promise<ResultadoAvisos> {
  const modo = await modoGastosAuto(db);
  const res: ResultadoAvisos = { agregados: 0, pendientes: 0, procesados: [], fallidos: 0 };
  for (const a of avisos) {
    const valido = a && typeof a.pkg === 'string' && typeof a.ts === 'number' && Number.isFinite(a.ts);
    if (!valido || !esAppDeBanco(a.pkg)) {
      if (a) res.procesados.push(a); // basura o no es de un banco: se quita de la cola
      continue;
    }
    try {
      const r = await guardarAviso(db, a, modo);
      if (r === 'agregado') res.agregados++;
      else if (r === 'pendiente') res.pendientes++;
      res.procesados.push(a);
    } catch (e) {
      console.warn('No se pudo guardar un aviso del banco (se reintenta después)', e);
      res.fallidos++;
    }
  }
  return res;
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
/**
 * Convierte un aviso en gasto. Es seguro tocar dos veces: el aviso se "reclama" primero
 * (solo si aún no estaba agregado) y el gasto se crea en la MISMA transacción.
 */
export async function aceptarAviso(db: SQLiteDatabase, id: number, categoria?: string): Promise<number | null> {
  return transaccion(db, async (tx) => {
    const reclamo = await tx.runAsync(
      "UPDATE bank_alerts SET estado = 'agregado' WHERE id = ? AND estado != 'agregado' AND monto > 0",
      id,
    );
    if (!reclamo.changes) return null; // ya estaba agregado (doble toque) o no tiene monto
    const a = await tx.getFirstAsync<AvisoGuardado>('SELECT * FROM bank_alerts WHERE id = ?', id);
    if (!a?.monto) throw new Error('Aviso sin monto');
    const cat = categoria ?? a.categoria ?? 'otros';
    const gid = await crearGasto(tx, { amount: a.monto, category: cat, note: notaDe(a), date: toISODate(new Date(a.ts)) });
    await tx.runAsync('UPDATE bank_alerts SET expense_id = ?, categoria = ? WHERE id = ?', gid, cat, id);
    return gid;
  });
}

/** Descarta un aviso pendiente (uno ya convertido en gasto no se toca). */
export async function descartarAviso(db: SQLiteDatabase, id: number) {
  await db.runAsync("UPDATE bank_alerts SET estado = 'descartado' WHERE id = ? AND estado != 'agregado'", id);
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
