/**
 * Consultas a la base de datos que usa la pantalla "Hoy" y Ajustes.
 * Cada módulo tendrá su propio archivo (tareas.ts, gastos.ts, gym.ts…)
 * a medida que avancemos por fases.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { endOfWeek, startOfWeek, toISODate, weekdayMonFirst } from '@/utils/fechas';

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
  const hoyISO = toISODate(hoy);
  const diaSemana = String(weekdayMonFirst(hoy));

  const tareas = await db.getFirstAsync<{ pendientes: number; hechas: number }>(
    `
    SELECT
      SUM(CASE WHEN hecha = 0 THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN hecha = 1 THEN 1 ELSE 0 END) AS hechas
    FROM (
      SELECT
        CASE
          WHEN t.repeat_type = 'none' THEN t.done
          ELSE EXISTS (SELECT 1 FROM task_completions c WHERE c.task_id = t.id AND c.date = $hoy)
        END AS hecha
      FROM tasks t
      WHERE (t.repeat_type = 'none' AND t.due_date = $hoy)
         OR (t.repeat_type = 'daily')
         OR (t.repeat_type = 'weekdays' AND (',' || t.repeat_days || ',') LIKE '%,' || $dia || ',%')
    )
    `,
    { $hoy: hoyISO, $dia: diaSemana },
  );

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
    tareasPendientes: tareas?.pendientes ?? 0,
    tareasHechas: tareas?.hechas ?? 0,
    gymHoy: gym?.label ?? null,
    gastoSemana: gasto?.total ?? 0,
    presupuestoSemana: presupuesto,
  };
}
