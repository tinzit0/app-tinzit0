/**
 * Estadísticas de un mes: tareas, gym, gastos por categoría y hábitos,
 * más la comparación con el mes anterior.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { toISODate } from '@/utils/fechas';
import { totalEnRango, totalPorCategoria } from './gastos';
import { fechasEntrenadas } from './gym';
import { tareasDelDia } from './tareas';

export type ResumenMes = {
  desde: string;
  hasta: string;
  diasContados: number; // días del mes ya transcurridos (o todos, si es un mes pasado)
  tareasHechas: number;
  tareasPendientes: number;
  diasGym: string[];
  gastoTotal: number;
  porCategoria: { category: string; total: number }[];
  habitos: { id: number; name: string; color: string; dias: number }[];
  habitosPct: number; // % de cumplimiento promedio de hábitos
};

export type ComparacionMes = { actual: ResumenMes; anterior: ResumenMes };

function rangoDelMes(anio: number, mes0: number) {
  const desde = new Date(anio, mes0, 1);
  const hasta = new Date(anio, mes0 + 1, 0);
  return { desde, hasta, desdeISO: toISODate(desde), hastaISO: toISODate(hasta) };
}

export async function resumenMes(db: SQLiteDatabase, anio: number, mes0: number): Promise<ResumenMes> {
  const { desde, hasta, desdeISO, hastaISO } = rangoDelMes(anio, mes0);
  const hoy = new Date();
  const ultimoDia = hasta < hoy ? hasta : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const futuro = desde > hoy;

  // Tareas: recorremos cada día ya vivido del mes.
  let hechas = 0;
  let pendientes = 0;
  let dias = 0;
  if (!futuro) {
    for (let d = new Date(desde); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
      dias++;
      const iso = toISODate(d);
      const lista = await tareasDelDia(db, iso);
      // En días pasados no contamos las "atrasadas" que arrastra hoy (ya se cuentan en su día).
      for (const t of lista) {
        if (t.atrasada) continue;
        if (t.hecha) hechas++;
        else pendientes++;
      }
    }
  }
  // Tareas sin día fijo ("de la semana") que vencían en este mes.
  const semanales = await db.getFirstAsync<{ h: number; p: number }>(
    `SELECT SUM(done = 1) AS h, SUM(done = 0) AS p FROM tasks WHERE scope = 'semanal' AND due_date BETWEEN ? AND ?`,
    desdeISO,
    hastaISO,
  );
  hechas += semanales?.h ?? 0;
  pendientes += semanales?.p ?? 0;

  const rango = { desde: desdeISO, hasta: hastaISO };
  const diasGym = await fechasEntrenadas(db, rango);
  const gastoTotal = await totalEnRango(db, rango);
  const porCategoria = await totalPorCategoria(db, rango);

  const habitos = await db.getAllAsync<{ id: number; name: string; color: string; dias: number }>(
    `SELECT h.id, h.name, h.color,
            (SELECT COUNT(*) FROM habit_logs l WHERE l.habit_id = h.id AND l.date BETWEEN ? AND ?) AS dias
     FROM habits h WHERE h.archived = 0 ORDER BY h.position, h.id`,
    desdeISO,
    hastaISO,
  );
  const habitosPct =
    habitos.length && dias ? habitos.reduce((s, h) => s + Math.min(1, h.dias / dias), 0) / habitos.length : 0;

  return {
    desde: desdeISO,
    hasta: hastaISO,
    diasContados: dias,
    tareasHechas: hechas,
    tareasPendientes: pendientes,
    diasGym,
    gastoTotal,
    porCategoria,
    habitos,
    habitosPct,
  };
}

export async function compararMes(db: SQLiteDatabase, anio: number, mes0: number): Promise<ComparacionMes> {
  const ant = new Date(anio, mes0 - 1, 1);
  const [actual, anterior] = await Promise.all([
    resumenMes(db, anio, mes0),
    resumenMes(db, ant.getFullYear(), ant.getMonth()),
  ]);
  return { actual, anterior };
}
