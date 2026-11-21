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
  /** '1,3,5' (lunes=1 … domingo=7) o null = todos los días. */
  days: string | null;
};

export type HabitoConEstado = Habito & { hechoHoy: boolean; tocaHoy: boolean; racha: number; mejorRacha: number; total: number };

/** '1,3,5' → [1,3,5]; null o vacío → null (todos los días). */
export function leerDias(days: string | null | undefined): number[] | null {
  if (!days) return null;
  const xs = [...new Set(days.split(',').map(Number).filter((n) => n >= 1 && n <= 7))].sort();
  return xs.length && xs.length < 7 ? xs : null;
}

export function escribirDias(dias: number[] | null): string | null {
  const xs = leerDias(dias?.join(',') ?? null);
  return xs ? xs.join(',') : null;
}

/** Lunes=1 … domingo=7 de una fecha 'YYYY-MM-DD'. */
function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
}

/** ¿Toca este hábito ese día? */
export function tocaEl(dias: number[] | null, iso: string): boolean {
  return !dias || dias.includes(diaSemana(iso));
}

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
export function calcularRacha(fechas: Set<string>, hoy = toISODate(), dias: number[] | null = null): number {
  // Los días en que no toca el hábito no cortan la racha (y si igual lo hiciste, suma).
  let dia = fechas.has(hoy) ? hoy : sumarDias(hoy, -1);
  let n = 0;
  for (let k = 0; k < 800; k++) {
    if (fechas.has(dia)) n++;
    else if (tocaEl(dias, dia)) break;
    dia = sumarDias(dia, -1);
  }
  return n;
}

/** La racha más larga de la historia. */
export function calcularMejorRacha(fechasOrdenadas: string[], dias: number[] | null = null): number {
  let mejor = 0;
  let actual = 0;
  let anterior: string | null = null;
  for (const f of fechasOrdenadas) {
    // Seguida = no hubo ningún día "que tocaba" sin marcar entre la anterior y esta.
    let seguida = false;
    if (anterior) {
      seguida = true;
      for (let d = sumarDias(anterior, 1); d < f; d = sumarDias(d, 1)) {
        if (tocaEl(dias, d)) {
          seguida = false;
          break;
        }
      }
    }
    actual = seguida ? actual + 1 : 1;
    mejor = Math.max(mejor, actual);
    anterior = f;
  }
  return mejor;
}

export async function listarHabitos(db: SQLiteDatabase): Promise<HabitoConEstado[]> {
  const habitos = await db.getAllAsync<Habito>('SELECT * FROM habits WHERE archived = 0 ORDER BY position, id');
  const hoy = toISODate();
  // Una sola consulta para todos los registros (antes era una por hábito).
  const logs = await db.getAllAsync<{ habit_id: number; date: string }>(
    'SELECT l.habit_id, l.date FROM habit_logs l JOIN habits h ON h.id = l.habit_id WHERE h.archived = 0 ORDER BY l.date',
  );
  const porHabito = new Map<number, string[]>();
  for (const l of logs) {
    const lista = porHabito.get(l.habit_id);
    if (lista) lista.push(l.date);
    else porHabito.set(l.habit_id, [l.date]);
  }
  const out: HabitoConEstado[] = [];
  for (const h of habitos) {
    const fechas = porHabito.get(h.id) ?? [];
    const set = new Set(fechas);
    const dias = leerDias(h.days);
    out.push({
      ...h,
      hechoHoy: set.has(hoy),
      tocaHoy: tocaEl(dias, hoy),
      racha: calcularRacha(set, hoy, dias),
      mejorRacha: calcularMejorRacha(fechas, dias),
      total: fechas.length,
    });
  }
  return out;
}

export async function obtenerHabito(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Habito>('SELECT * FROM habits WHERE id = ?', id);
}

export async function crearHabito(db: SQLiteDatabase, h: { name: string; icon: string; color: string; days?: number[] | null }) {
  const pos = await db.getFirstAsync<{ p: number | null }>('SELECT MAX(position) AS p FROM habits');
  const r = await db.runAsync(
    'INSERT INTO habits (name, icon, color, position, days) VALUES (?, ?, ?, ?, ?)',
    h.name.trim(),
    h.icon,
    h.color,
    (pos?.p ?? -1) + 1,
    escribirDias(h.days ?? null),
  );
  return r.lastInsertRowId;
}

export async function actualizarHabito(db: SQLiteDatabase, id: number, h: { name: string; icon: string; color: string; days?: number[] | null }) {
  await db.runAsync('UPDATE habits SET name = ?, icon = ?, color = ?, days = ? WHERE id = ?', h.name.trim(), h.icon, h.color, escribirDias(h.days ?? null), id);
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
