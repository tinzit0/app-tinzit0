/**
 * Aprendizaje de Tinzit0 (todo en tu celular, gratis).
 *
 * - Cuando no entiende y eliges "¿Quisiste decir…?", guarda tu frase → comando.
 * - También le puedes enseñar: "cuando diga ya llegué, muéstrame mis tareas".
 * - La próxima vez que digas esa frase (o una MUY parecida), lo hace directo.
 * - Con "olvida ya llegué" lo desaprende.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { CORPUS } from './corpus';
import { parecidoFrases, tokens } from './similitud';
import { normalizar, sinActivacion } from './texto';

export type Sugerencia = { comando: string; etiqueta: string; puntaje: number };

/** Busca algo aprendido para esta frase. */
export async function buscarAprendido(db: SQLiteDatabase, frase: string): Promise<string | null> {
  const n = normalizar(sinActivacion(frase));
  if (!n) return null;
  const exacta = await db.getFirstAsync<{ comando: string }>('SELECT comando FROM voice_learned WHERE frase = ?', n);
  if (exacta) {
    await db.runAsync('UPDATE voice_learned SET usos = usos + 1 WHERE frase = ?', n);
    return exacta.comando;
  }
  // Muy parecida a algo aprendido (por si el reconocedor cambia una palabra)
  const todas = await db.getAllAsync<{ frase: string; comando: string }>('SELECT frase, comando FROM voice_learned');
  const t = tokens(n);
  let mejor: { comando: string; p: number } | null = null;
  for (const a of todas) {
    const p = parecidoFrases(t, tokens(a.frase));
    if (p >= 0.85 && (!mejor || p > mejor.p)) mejor = { comando: a.comando, p };
  }
  return mejor?.comando ?? null;
}

export async function aprender(db: SQLiteDatabase, frase: string, comando: string) {
  const n = normalizar(sinActivacion(frase));
  if (!n || normalizar(comando) === n) return;
  await db.runAsync(
    `INSERT INTO voice_learned (frase, comando, usos) VALUES (?, ?, 1)
     ON CONFLICT(frase) DO UPDATE SET comando = excluded.comando`,
    n,
    comando.trim(),
  );
}

export async function olvidar(db: SQLiteDatabase, frase: string): Promise<boolean> {
  const r = await db.runAsync('DELETE FROM voice_learned WHERE frase = ?', normalizar(frase));
  return r.changes > 0;
}

export async function listarAprendido(db: SQLiteDatabase) {
  return db.getAllAsync<{ frase: string; comando: string; usos: number }>('SELECT frase, comando, usos FROM voice_learned ORDER BY usos DESC, frase');
}

/** Las frases del corpus más parecidas (para entender por parecido o sugerir). */
export function sugerir(frase: string, max = 3): Sugerencia[] {
  const t = tokens(sinActivacion(frase));
  if (!t.length) return [];
  return CORPUS.map((g) => {
    const p = Math.max(parecidoFrases(t, tokens(g.comando)), ...g.ejemplos.map((e) => parecidoFrases(t, tokens(e))));
    return { comando: g.comando, etiqueta: g.etiqueta, puntaje: p };
  })
    .filter((s) => s.puntaje > 0.2)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, max);
}
