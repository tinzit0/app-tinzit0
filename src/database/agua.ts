/**
 * Agua en la base de datos (tabla water_logs, migración v16; ajustes en settings con prefijo agua_).
 * La lógica (horarios de aviso, progreso) vive en src/agua/logica.ts.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { leerAjustesAgua, type AjustesAgua } from '@/agua/logica';
import { toISODate } from '@/utils/fechas';
import { getSetting, setSetting } from './queries';

const CLAVES: Record<keyof AjustesAgua, string> = {
  metaMl: 'agua_meta_ml',
  vasoMl: 'agua_vaso_ml',
  avisos: 'notif_agua',
  cadaMin: 'agua_cada_min',
  desde: 'agua_desde',
  hasta: 'agua_hasta',
  pausaHasta: 'agua_pausa_hasta',
};

export async function ajustesAgua(db: SQLiteDatabase): Promise<AjustesAgua> {
  const pares = await Promise.all(Object.entries(CLAVES).map(async ([k, clave]) => [k, await getSetting(db, clave)] as const));
  return leerAjustesAgua(Object.fromEntries(pares));
}

export async function guardarAjusteAgua<K extends keyof AjustesAgua>(db: SQLiteDatabase, k: K, v: AjustesAgua[K]) {
  const texto = typeof v === 'boolean' ? (v ? '1' : '0') : v == null ? '' : String(v);
  await setSetting(db, CLAVES[k], texto);
}

/** Registra lo que tomaste (por defecto, un vaso). */
export async function tomarAgua(db: SQLiteDatabase, ml: number, cuando = new Date()): Promise<void> {
  const m = Math.round(ml);
  if (!(m > 0) || m > 5000) throw new Error('Cantidad de agua no válida.');
  const hora = `${String(cuando.getHours()).padStart(2, '0')}:${String(cuando.getMinutes()).padStart(2, '0')}`;
  await db.runAsync('INSERT INTO water_logs (ml, date, time) VALUES (?, ?, ?)', m, toISODate(cuando), hora);
}

/** Deshace el último vaso de hoy (por si tocaste sin querer). */
export async function deshacerUltimoVaso(db: SQLiteDatabase, fecha = toISODate()): Promise<boolean> {
  const r = await db.runAsync('DELETE FROM water_logs WHERE id = (SELECT id FROM water_logs WHERE date = ? ORDER BY id DESC LIMIT 1)', fecha);
  return r.changes > 0;
}

export async function aguaDelDia(db: SQLiteDatabase, fecha = toISODate()): Promise<number> {
  const r = await db.getFirstAsync<{ ml: number }>('SELECT COALESCE(SUM(ml), 0) AS ml FROM water_logs WHERE date = ?', fecha);
  return r?.ml ?? 0;
}

/** Los últimos 7 días (de más antiguo a hoy), con 0 en los días sin registro. */
export async function aguaSemana(db: SQLiteDatabase, hoy = new Date()): Promise<{ fecha: string; ml: number }[]> {
  const dias = Array.from({ length: 7 }, (_, k) => toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6 + k)));
  const filas = await db.getAllAsync<{ date: string; ml: number }>(
    'SELECT date, SUM(ml) AS ml FROM water_logs WHERE date >= ? AND date <= ? GROUP BY date',
    dias[0],
    dias[6],
  );
  const mapa = new Map(filas.map((f) => [f.date, f.ml]));
  return dias.map((fecha) => ({ fecha, ml: mapa.get(fecha) ?? 0 }));
}

/** ¿Cumpliste la meta de agua ese día? (lo usan las rachas con amigos). */
export async function cumplioMetaAgua(db: SQLiteDatabase, fecha = toISODate()): Promise<boolean> {
  const [ml, a] = await Promise.all([aguaDelDia(db, fecha), ajustesAgua(db)]);
  return ml >= a.metaMl;
}
