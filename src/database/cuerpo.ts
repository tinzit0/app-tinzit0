/**
 * Peso corporal y medidas (pecho, brazo, cintura, pierna).
 * Una medición por fecha: si registras dos veces el mismo día, se actualiza.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type Medida = 'weight' | 'chest' | 'arm' | 'waist' | 'leg';

export const MEDIDAS: { key: Medida; label: string; unidad: string }[] = [
  { key: 'weight', label: 'Peso', unidad: 'kg' },
  { key: 'chest', label: 'Pecho', unidad: 'cm' },
  { key: 'arm', label: 'Brazo', unidad: 'cm' },
  { key: 'waist', label: 'Cintura', unidad: 'cm' },
  { key: 'leg', label: 'Pierna', unidad: 'cm' },
];

export type Medicion = { id: number; date: string } & Record<Medida, number | null>;

export async function listarMediciones(db: SQLiteDatabase): Promise<Medicion[]> {
  return db.getAllAsync<Medicion>('SELECT * FROM body_metrics ORDER BY date, id');
}

export async function medicionDeFecha(db: SQLiteDatabase, fecha: string): Promise<Medicion | null> {
  return db.getFirstAsync<Medicion>('SELECT * FROM body_metrics WHERE date = ? ORDER BY id DESC LIMIT 1', fecha);
}

/** Último valor registrado de cada medida (pueden ser de fechas distintas). */
export async function ultimosValores(db: SQLiteDatabase) {
  const out: Partial<Record<Medida, { valor: number; fecha: string }>> = {};
  for (const m of MEDIDAS) {
    const r = await db.getFirstAsync<{ v: number; date: string }>(
      `SELECT ${m.key} AS v, date FROM body_metrics WHERE ${m.key} IS NOT NULL ORDER BY date DESC, id DESC LIMIT 1`,
    );
    if (r) out[m.key] = { valor: r.v, fecha: r.date };
  }
  return out;
}

/** Guarda la medición del día (crea o actualiza). Los campos vacíos no borran lo anterior del mismo día. */
export async function guardarMedicion(db: SQLiteDatabase, fecha: string, valores: Partial<Record<Medida, number | null>>) {
  const existe = await medicionDeFecha(db, fecha);
  const limpio = (v: number | null | undefined) => (v && v > 0 ? Math.round(v * 10) / 10 : null);
  if (existe) {
    await db.runAsync(
      `UPDATE body_metrics SET
         weight = COALESCE(?, weight), chest = COALESCE(?, chest), arm = COALESCE(?, arm),
         waist = COALESCE(?, waist), leg = COALESCE(?, leg)
       WHERE id = ?`,
      limpio(valores.weight),
      limpio(valores.chest),
      limpio(valores.arm),
      limpio(valores.waist),
      limpio(valores.leg),
      existe.id,
    );
  } else {
    await db.runAsync(
      'INSERT INTO body_metrics (date, weight, chest, arm, waist, leg) VALUES (?, ?, ?, ?, ?, ?)',
      fecha,
      limpio(valores.weight),
      limpio(valores.chest),
      limpio(valores.arm),
      limpio(valores.waist),
      limpio(valores.leg),
    );
  }
}

export async function eliminarMedicion(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM body_metrics WHERE id = ?', id);
}
