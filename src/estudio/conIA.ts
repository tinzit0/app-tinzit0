/**
 * Tarjetas y resúmenes: primero intenta con la IA del celular (si la descargaste en Ajustes);
 * si no está o falla, usa el método sin IA (instantáneo). Siempre gratis y sin internet.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { generarTexto } from '@/ia/modelo';
import { resumirTexto, tarjetasDesdeTexto, type TarjetaNueva } from './logica';

export async function tarjetasConIA(db: SQLiteDatabase, texto: string): Promise<{ tarjetas: TarjetaNueva[]; conIA: boolean }> {
  try {
    const out = await generarTexto(
      db,
      'Del texto que te paso, crea entre 4 y 10 tarjetas de estudio con lo más importante. Usa EXACTAMENTE este formato, una por par de líneas:\nP: pregunta corta\nR: respuesta corta',
      texto,
    );
    const t = tarjetasDesdeTexto(out).filter((x) => x.front.length <= 200 && x.back.length <= 400);
    if (t.length) return { tarjetas: t, conIA: true };
  } catch {
    // sin IA: seguimos sin ella
  }
  return { tarjetas: tarjetasDesdeTexto(texto), conIA: false };
}

export async function resumenConIA(db: SQLiteDatabase, texto: string): Promise<{ puntos: string[]; conIA: boolean }> {
  try {
    const out = await generarTexto(db, 'Resume la clase que te paso en 3 a 6 puntos cortos, uno por línea, empezando cada uno con "- ". Solo las ideas principales.', texto);
    const puntos = out
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim())
      .filter((l) => l.length > 3);
    if (puntos.length) return { puntos: puntos.slice(0, 8), conIA: true };
  } catch {
    // sin IA
  }
  return { puntos: resumirTexto(texto, 5), conIA: false };
}
