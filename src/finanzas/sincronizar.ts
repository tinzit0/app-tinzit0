/**
 * Pasa los avisos del banco guardados por el servicio nativo a la base de datos.
 * Se llama al abrir/volver a la app y cada vez que llega un aviso con la app abierta.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { Avisos } from '../../modules/tinzit0-avisos';
import { procesarAvisos } from '@/database/finanzas';
import type { AvisoBanco } from './banco';

export const avisosDisponibles = () => Avisos !== null;

export function permisoAvisos(): boolean {
  try {
    return Avisos?.tienePermiso() ?? false;
  } catch {
    return false;
  }
}

let enCurso: Promise<{ agregados: number; pendientes: number }> | null = null;

export function sincronizarAvisos(db: SQLiteDatabase): Promise<{ agregados: number; pendientes: number }> {
  if (!Avisos) return Promise.resolve({ agregados: 0, pendientes: 0 });
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const raw = Avisos.leerCola();
      const lista = JSON.parse(raw || '[]') as AvisoBanco[];
      if (!lista.length) return { agregados: 0, pendientes: 0 };
      const r = await procesarAvisos(db, lista);
      Avisos.vaciarCola(); // solo después de guardar (si falla, se reintenta)
      return r;
    } catch (e) {
      console.warn('No se pudieron leer los avisos del banco', e);
      return { agregados: 0, pendientes: 0 };
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/** Escucha avisos en vivo (app abierta). Devuelve cómo dejar de escuchar. */
export function escucharAvisos(alLlegar: () => void): () => void {
  if (!Avisos) return () => {};
  const sub = Avisos.addListener('onAviso', alLlegar);
  return () => sub.remove();
}
