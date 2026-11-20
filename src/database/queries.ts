/**
 * Consultas a la base de datos que usa la pantalla "Hoy" y Ajustes.
 * Cada módulo tendrá su propio archivo (tareas.ts, gastos.ts, gym.ts…)
 * a medida que avancemos por fases.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { endOfWeek, startOfWeek, toISODate, weekdayMonFirst } from '@/utils/fechas';
import { conteoHoy } from './tareas';

// ---------- Ajustes (clave → valor) ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// ---------- Resumen para "Hoy" ----------

export type ResumenHoy = {
  nombre: string;
  tareasPendientes: number;
  tareasHechas: number;
  gymHoy: string | null; // ej: 'Pecho' o null si es descanso
  gastoSemana: number;
  presupuestoSemana: number;
};

/**
 * Junta en una sola llamada lo que muestra la pantalla de inicio.
 * Una tarea "es de hoy" si su fecha es hoy, si se repite todos los días,
 * o si se repite en el día de la semana actual.
 */
export async function getResumenHoy(db: SQLiteDatabase): Promise<ResumenHoy> {
  const hoy = new Date();
  const tareas = await conteoHoy(db);

  const gym = await db.getFirstAsync<{ label: string }>(
    'SELECT label FROM gym_routine WHERE weekday = ?',
    weekdayMonFirst(hoy),
  );

  const gasto = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(amount) AS total FROM expenses WHERE date BETWEEN ? AND ?',
    toISODate(startOfWeek(hoy)),
    toISODate(endOfWeek(hoy)),
  );

  const nombre = (await getSetting(db, 'nombre')) ?? '';
  const presupuesto = Number((await getSetting(db, 'presupuesto_semanal')) ?? 0);

  return {
    nombre,
    tareasPendientes: tareas.pendientes,
    tareasHechas: tareas.hechas,
    gymHoy: gym?.label ?? null,
    gastoSemana: gasto?.total ?? 0,
    presupuestoSemana: presupuesto,
  };
}
