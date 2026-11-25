/**
 * Malla interactiva en la base de datos (tabla curriculum_courses, migración v13).
 * La lógica (qué ramos se pueden tomar, progreso) vive en src/malla/logica.ts.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { EstadoMalla, RamoMalla, RamoMallaNuevo } from '@/malla/logica';
import { getSetting } from './queries';
import { transaccion } from './tx';

type Fila = { id: number; name: string; semester: number; credits: number; area: string | null; prereqs: string; status: string };

const leerIds = (s: string) => s.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
const aRamo = (f: Fila): RamoMalla => ({
  ...f,
  prereqs: leerIds(f.prereqs),
  status: f.status === 'aprobado' || f.status === 'cursando' ? f.status : 'pendiente',
});

export async function listarMalla(db: SQLiteDatabase): Promise<RamoMalla[]> {
  const filas = await db.getAllAsync<Fila>('SELECT * FROM curriculum_courses ORDER BY semester, id');
  return filas.map(aRamo);
}

export async function nombreMalla(db: SQLiteDatabase): Promise<string | null> {
  return getSetting(db, 'malla_nombre');
}

/**
 * Reemplaza la malla completa (todo o nada). Los prerrequisitos vienen con los ids de origen
 * y se traducen a los ids nuevos de la tabla.
 */
export async function cargarMalla(db: SQLiteDatabase, nombre: string, ramos: RamoMallaNuevo[]): Promise<number> {
  return transaccion(db, async (tx) => {
    await tx.runAsync('DELETE FROM curriculum_courses');
    const ids = new Map<number, number>();
    for (const r of ramos) {
      const x = await tx.runAsync(
        'INSERT INTO curriculum_courses (name, semester, credits, area) VALUES (?, ?, ?, ?)',
        r.name.trim(),
        r.semester,
        r.credits,
        r.area,
      );
      ids.set(r.ref, x.lastInsertRowId);
    }
    for (const r of ramos) {
      const pre = r.prereqs.map((p) => ids.get(p)).filter((n): n is number => n != null);
      if (pre.length) await tx.runAsync('UPDATE curriculum_courses SET prereqs = ? WHERE id = ?', pre.join(','), ids.get(r.ref)!);
    }
    await tx.runAsync(
      "INSERT INTO settings (key, value) VALUES ('malla_nombre', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      nombre.trim().slice(0, 80),
    );
    return ramos.length;
  });
}

/** Malla vacía para armarla a mano. */
export async function empezarMallaVacia(db: SQLiteDatabase, nombre: string) {
  await cargarMalla(db, nombre || 'Mi carrera', []);
}

export async function borrarMalla(db: SQLiteDatabase) {
  await transaccion(db, async (tx) => {
    await tx.runAsync('DELETE FROM curriculum_courses');
    await tx.runAsync("DELETE FROM settings WHERE key = 'malla_nombre'");
  });
}

export async function cambiarEstadoMalla(db: SQLiteDatabase, id: number, estado: EstadoMalla) {
  await db.runAsync('UPDATE curriculum_courses SET status = ? WHERE id = ?', estado, id);
}

export type DatosRamoMalla = { name: string; semester: number; credits: number; area?: string | null; prereqs: number[] };

export async function obtenerRamoMalla(db: SQLiteDatabase, id: number): Promise<RamoMalla | null> {
  const f = await db.getFirstAsync<Fila>('SELECT * FROM curriculum_courses WHERE id = ?', id);
  return f ? aRamo(f) : null;
}

export async function guardarRamoMalla(db: SQLiteDatabase, id: number | null, d: DatosRamoMalla): Promise<number> {
  const pre = d.prereqs.filter((p) => p !== id).join(',');
  if (id) {
    await db.runAsync(
      'UPDATE curriculum_courses SET name = ?, semester = ?, credits = ?, area = ?, prereqs = ? WHERE id = ?',
      d.name.trim(),
      d.semester,
      d.credits,
      d.area ?? null,
      pre,
      id,
    );
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO curriculum_courses (name, semester, credits, area, prereqs) VALUES (?, ?, ?, ?, ?)',
    d.name.trim(),
    d.semester,
    d.credits,
    d.area ?? null,
    pre,
  );
  return r.lastInsertRowId;
}

/** Quita un ramo y lo saca de los prerrequisitos de los demás. */
export async function eliminarRamoMalla(db: SQLiteDatabase, id: number) {
  await transaccion(db, async (tx) => {
    await tx.runAsync('DELETE FROM curriculum_courses WHERE id = ?', id);
    const filas = await tx.getAllAsync<Fila>("SELECT * FROM curriculum_courses WHERE ',' || prereqs || ',' LIKE ?", `%,${id},%`);
    for (const f of filas) {
      await tx.runAsync('UPDATE curriculum_courses SET prereqs = ? WHERE id = ?', leerIds(f.prereqs).filter((p) => p !== id).join(','), f.id);
    }
  });
}
