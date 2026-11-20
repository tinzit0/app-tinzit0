/**
 * Hábitos: se marcan una vez por día. Calculamos rachas (días seguidos)
 * y el historial para el mapa de calor.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { toISODate } from '@/utils/fechas';

export type Habito = {
  id: number;
  name: string;
  icon: string;
  color: string;
  position: number;
};

export type HabitoConEstado = Habito & { hechoHoy: boolean; racha: number; mejorRacha: number; total: number };

/** Sugerencias para crear hábitos rápido. */
export const SUGERENCIAS: { name: string; icon: string; color: string }[] = [
  { name: 'Tomar 2 litros de agua', icon: 'water', color: '#38BDF8' },
  { name: 'Leer 20 minutos', icon: 'book', color: '#F59E0B' },
  { name: 'Dormir 8 horas', icon: 'moon', color: '#A78BFA' },
  { name: 'Caminar 10 mil pasos', icon: 'walk', color: '#34D399' },
  { name: 'Meditar', icon: 'leaf', color: '#2DD4BF' },
  { name: 'Sin redes antes de dormir', icon: 'phone-portrait', color: '#F472B6' },
  { name: 'Estirar', icon: 'body', color: '#FB923C' },
  { name: 'Comer fruta', icon: 'nutrition', color: '#EF4444' },
];

export const COLORES = ['#CFF56B', '#38BDF8', '#F59E0B', '#A78BFA', '#34D399', '#F472B6', '#FB923C', '#EF4444'];
export const ICONOS = ['checkmark', 'water', 'book', 'moon', 'walk', 'leaf', 'barbell', 'nutrition', 'phone-portrait', 'body', 'musical-notes', 'school', 'bed', 'heart', 'cafe', 'code-slash'];

function sumarDias(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

/**
 * Racha actual: días seguidos marcados terminando hoy.
 * Si hoy aún no lo marcas, la racha de ayer sigue "viva" (no se corta hasta mañana).
 */
export function calcularRacha(fechas: Set<string>, hoy = toISODate()): number {
  let dia = fechas.has(hoy) ? hoy : sumarDias(hoy, -1);
  let n = 0;
  while (fechas.has(dia)) {
    n++;
    dia = sumarDias(dia, -1);
  }
  return n;
}

/** La racha más larga de la historia. */
export function calcularMejorRacha(fechasOrdenadas: string[]): number {
  let mejor = 0;
  let actual = 0;
  let anterior: string | null = null;
  for (const f of fechasOrdenadas) {
    actual = anterior && sumarDias(anterior, 1) === f ? actual + 1 : 1;
    mejor = Math.max(mejor, actual);
    anterior = f;
  }
  return mejor;
}

export async function listarHabitos(db: SQLiteDatabase): Promise<HabitoConEstado[]> {
  const habitos = await db.getAllAsync<Habito>('SELECT * FROM habits WHERE archived = 0 ORDER BY position, id');
  const hoy = toISODate();
  const out: HabitoConEstado[] = [];
  for (const h of habitos) {
    const fechas = (await db.getAllAsync<{ date: string }>('SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date', h.id)).map(
      (r) => r.date,
    );
    const set = new Set(fechas);
    out.push({
      ...h,
      hechoHoy: set.has(hoy),
      racha: calcularRacha(set, hoy),
      mejorRacha: calcularMejorRacha(fechas),
      total: fechas.length,
    });
  }
  return out;
}

export async function obtenerHabito(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Habito>('SELECT * FROM habits WHERE id = ?', id);
}

export async function crearHabito(db: SQLiteDatabase, h: { name: string; icon: string; color: string }) {
  const pos = await db.getFirstAsync<{ p: number | null }>('SELECT MAX(position) AS p FROM habits');
  const r = await db.runAsync(
    'INSERT INTO habits (name, icon, color, position) VALUES (?, ?, ?, ?)',
    h.name.trim(),
    h.icon,
    h.color,
    (pos?.p ?? -1) + 1,
  );
  return r.lastInsertRowId;
}

export async function actualizarHabito(db: SQLiteDatabase, id: number, h: { name: string; icon: string; color: string }) {
  await db.runAsync('UPDATE habits SET name = ?, icon = ?, color = ? WHERE id = ?', h.name.trim(), h.icon, h.color, id);
}

export async function eliminarHabito(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM habits WHERE id = ?', id);
}

export async function alternarHabito(db: SQLiteDatabase, id: number, hecho: boolean, fecha = toISODate()) {
  if (hecho) await db.runAsync('INSERT OR IGNORE INTO habit_logs (habit_id, date) VALUES (?, ?)', id, fecha);
  else await db.runAsync('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?', id, fecha);
}

/** Fechas marcadas de un hábito (o de todos, si id es null) desde una fecha. Devuelve fecha → cantidad. */
export async function registrosDesde(db: SQLiteDatabase, desde: string, id: number | null = null): Promise<Map<string, number>> {
  const rows = id
    ? await db.getAllAsync<{ date: string; n: number }>(
        'SELECT date, COUNT(*) AS n FROM habit_logs WHERE habit_id = ? AND date >= ? GROUP BY date',
        id,
        desde,
      )
    : await db.getAllAsync<{ date: string; n: number }>(
        `SELECT l.date, COUNT(*) AS n FROM habit_logs l JOIN habits h ON h.id = l.habit_id
         WHERE h.archived = 0 AND l.date >= ? GROUP BY l.date`,
        desde,
      );
  return new Map(rows.map((r) => [r.date, r.n]));
}

/** Mejor racha entre todos los hábitos (para logros y el asistente). */
export async function mejorRachaGlobal(db: SQLiteDatabase): Promise<{ nombre: string; racha: number; actual: number } | null> {
  const hs = await listarHabitos(db);
  if (hs.length === 0) return null;
  const top = hs.reduce((a, b) => (b.mejorRacha > a.mejorRacha ? b : a));
  return { nombre: top.name, racha: top.mejorRacha, actual: top.racha };
}
