/**
 * Gastos fijos mensuales (arriendo, celular, Spotify…).
 * - Cada uno tiene un día de pago.
 * - Cuando llega ese día, se agrega solo como gasto del mes (una sola vez).
 * - Las notificaciones avisan un día antes.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { enExclusiva, transaccion } from './tx';

import { toISODate } from '@/utils/fechas';

export type GastoFijo = {
  id: number;
  name: string;
  amount: number;
  category: string;
  day_of_month: number;
  active: number;
};

export type NuevoFijo = { name: string; amount: number; category: string; day_of_month: number };

/** Días que tiene un mes. */
function diasDelMes(anio: number, mes0: number) {
  return new Date(anio, mes0 + 1, 0).getDate();
}

/** Día real de pago en un mes (si el fijo dice 31 y el mes tiene 30, es el 30). */
export function diaDePagoEn(f: Pick<GastoFijo, 'day_of_month'>, anio: number, mes0: number) {
  return Math.min(f.day_of_month, diasDelMes(anio, mes0));
}

export async function listarFijos(db: SQLiteDatabase): Promise<GastoFijo[]> {
  return db.getAllAsync<GastoFijo>('SELECT * FROM fixed_expenses ORDER BY active DESC, day_of_month, name');
}

export async function obtenerFijo(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<GastoFijo>('SELECT * FROM fixed_expenses WHERE id = ?', id);
}

export async function crearFijo(db: SQLiteDatabase, f: NuevoFijo) {
  const r = await db.runAsync(
    'INSERT INTO fixed_expenses (name, amount, category, day_of_month) VALUES (?, ?, ?, ?)',
    f.name.trim(),
    Math.round(f.amount),
    f.category,
    Math.min(31, Math.max(1, Math.round(f.day_of_month))),
  );
  return r.lastInsertRowId;
}

export async function actualizarFijo(db: SQLiteDatabase, id: number, f: NuevoFijo & { active?: boolean }) {
  await db.runAsync(
    'UPDATE fixed_expenses SET name = ?, amount = ?, category = ?, day_of_month = ?, active = ? WHERE id = ?',
    f.name.trim(),
    Math.round(f.amount),
    f.category,
    Math.min(31, Math.max(1, Math.round(f.day_of_month))),
    f.active === false ? 0 : 1,
    id,
  );
}

export async function eliminarFijo(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM fixed_expenses WHERE id = ?', id);
}

/** Total mensual de los fijos activos. */
export async function totalFijosMes(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ t: number | null }>('SELECT SUM(amount) AS t FROM fixed_expenses WHERE active = 1');
  return r?.t ?? 0;
}

/** Fijos activos cuyo día de pago cae en esta fecha. */
export async function fijosQueVencenEn(db: SQLiteDatabase, fecha: Date): Promise<GastoFijo[]> {
  const todos = await db.getAllAsync<GastoFijo>('SELECT * FROM fixed_expenses WHERE active = 1');
  return todos.filter((f) => diaDePagoEn(f, fecha.getFullYear(), fecha.getMonth()) === fecha.getDate());
}

/** ¿Ya se sumó este fijo en el mes? */
export async function pagadoEsteMes(db: SQLiteDatabase, id: number, hoy = new Date()) {
  const mes = toISODate(hoy).slice(0, 7);
  const r = await db.getFirstAsync('SELECT 1 FROM fixed_payments WHERE fixed_id = ? AND month = ?', id, mes);
  return !!r;
}

/**
 * Agrega como gasto los fijos cuyo día de pago ya llegó este mes y que aún
 * no se han sumado. Se llama al abrir la app. Devuelve cuántos agregó.
 *
 * Seguro ante ejecuciones simultáneas: cada fijo se "reclama" primero en fixed_payments
 * (clave única fijo+mes) y el gasto se crea en la MISMA transacción. Si otra ejecución ya lo
 * reclamó, esta no hace nada. Además corre en fila con las otras tareas de fondo.
 */
export function aplicarFijosDelMes(db: SQLiteDatabase, hoy = new Date()): Promise<number> {
  return enExclusiva(() => aplicarFijosSinFila(db, hoy));
}

export async function aplicarFijosSinFila(db: SQLiteDatabase, hoy = new Date()): Promise<number> {
  const mes = toISODate(hoy).slice(0, 7);
  const pendientes = await db.getAllAsync<GastoFijo>(
    `SELECT f.* FROM fixed_expenses f
     WHERE f.active = 1
       AND NOT EXISTS (SELECT 1 FROM fixed_payments p WHERE p.fixed_id = f.id AND p.month = ?)`,
    mes,
  );
  let n = 0;
  for (const f of pendientes) {
    const dia = diaDePagoEn(f, hoy.getFullYear(), hoy.getMonth());
    if (dia > hoy.getDate()) continue; // todavía no toca
    const fechaPago = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), dia));
    const agregado = await transaccion(db, async (tx) => {
      // 1) Reclamar el mes para este fijo. Si ya estaba (otra ejecución), no se hace nada.
      const reclamo = await tx.runAsync('INSERT OR IGNORE INTO fixed_payments (fixed_id, month, expense_id) VALUES (?, ?, NULL)', f.id, mes);
      if (!reclamo.changes) return false;
      // 2) Si el fijo se creó después de su día de pago de este mes, no se cobra retroactivo.
      const creado = await tx.getFirstAsync<{ c: string }>('SELECT created_at AS c FROM fixed_expenses WHERE id = ?', f.id);
      if (creado && creado.c.slice(0, 10) > fechaPago) return false;
      // 3) Crear el gasto y ligarlo.
      const r = await tx.runAsync(
        'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?)',
        f.amount,
        f.category,
        `${f.name} (fijo)`,
        fechaPago,
      );
      await tx.runAsync('UPDATE fixed_payments SET expense_id = ? WHERE fixed_id = ? AND month = ?', r.lastInsertRowId, f.id, mes);
      return true;
    });
    if (agregado) n++;
  }
  return n;
}
