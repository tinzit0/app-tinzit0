/**
 * Datos que muestra el widget de la pantalla de inicio del celular.
 * Es una función pura sobre la base de datos (se puede probar sin celular).
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { presupuestoSemanal, rangoSemana, totalEnRango } from '@/database/gastos';
import { rutinaDeHoy } from '@/database/gym';
import { tareasDelDia } from '@/database/tareas';
import { toISODate } from '@/utils/fechas';

export type DatosWidget = {
  pendientes: number;
  total: number;
  titulos: string[];
  gastoSemana: number;
  presupuesto: number;
  gym: string | null;
};

export async function datosWidget(db: SQLiteDatabase): Promise<DatosWidget> {
  const tareas = await tareasDelDia(db, toISODate());
  const pendientes = tareas.filter((t) => !t.hecha);
  return {
    pendientes: pendientes.length,
    total: tareas.length,
    titulos: pendientes.slice(0, 3).map((t) => t.title),
    gastoSemana: await totalEnRango(db, rangoSemana()),
    presupuesto: await presupuestoSemanal(db),
    gym: await rutinaDeHoy(db),
  };
}
