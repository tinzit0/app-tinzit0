/**
 * Notas rápidas: texto libre con fecha. Se pueden fijar arriba.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type Nota = {
  id: number;
  body: string;
  pinned: number;
  created_at: string;
  updated_at: string;
};

export async function listarNotas(db: SQLiteDatabase, busqueda = ''): Promise<Nota[]> {
  return db.getAllAsync<Nota>(
    `SELECT * FROM notes WHERE body LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    `%${busqueda}%`,
  );
}

export async function obtenerNota(db: SQLiteDatabase, id: number): Promise<Nota | null> {
  return db.getFirstAsync<Nota>('SELECT * FROM notes WHERE id = ?', id);
}

/** Crea o actualiza. Devuelve el id. Si el texto queda vacío, borra la nota. */
export async function guardarNota(db: SQLiteDatabase, id: number | null, body: string): Promise<number | null> {
  const limpio = body.trim();
  if (!limpio) {
    if (id) await eliminarNota(db, id);
    return null;
  }
  if (id) {
    await db.runAsync(
      `UPDATE notes SET body = ?, updated_at = datetime('now','localtime') WHERE id = ? AND body != ?`,
      limpio,
      id,
      limpio,
    );
    return id;
  }
  const r = await db.runAsync('INSERT INTO notes (body) VALUES (?)', limpio);
  return r.lastInsertRowId;
}

export async function fijarNota(db: SQLiteDatabase, id: number, fijada: boolean) {
  await db.runAsync('UPDATE notes SET pinned = ? WHERE id = ?', fijada ? 1 : 0, id);
}

export async function eliminarNota(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}
