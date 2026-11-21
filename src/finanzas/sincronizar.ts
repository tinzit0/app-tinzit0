/**
 * Pasa los avisos del banco guardados por el servicio nativo a la base de datos.
 * Se llama al abrir/volver a la app y cada vez que llega un aviso con la app abierta.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { Avisos } from '../../modules/tinzit0-avisos';
import { procesarAvisos } from '@/database/finanzas';
import { enExclusiva } from '@/database/tx';
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
let otraVez = false;

/**
 * Lee la cola del servicio nativo, guarda cada aviso y quita de la cola SOLO los que quedaron guardados.
 * Si llega un aviso mientras esto corre, se hace otra pasada al terminar (no se pierde).
 * Corre en fila con las otras tareas exclusivas (restaurar respaldo, gastos fijos).
 */
export function sincronizarAvisos(db: SQLiteDatabase): Promise<{ agregados: number; pendientes: number }> {
  if (!Avisos) return Promise.resolve({ agregados: 0, pendientes: 0 });
  if (enCurso) {
    otraVez = true;
    return enCurso;
  }
  enCurso = (async () => {
    const total = { agregados: 0, pendientes: 0 };
    try {
      do {
        otraVez = false;
        const r = await enExclusiva(() => unaPasada(db));
        total.agregados += r.agregados;
        total.pendientes += r.pendientes;
      } while (otraVez);
    } catch (e) {
      console.warn('No se pudieron leer los avisos del banco', e);
    } finally {
      enCurso = null;
    }
    return total;
  })();
  return enCurso;
}

async function unaPasada(db: SQLiteDatabase) {
  const modulo = Avisos!;
  let lista: AvisoBanco[];
  try {
    const crudo: unknown = JSON.parse(modulo.leerCola() || '[]');
    lista = Array.isArray(crudo) ? (crudo as AvisoBanco[]) : [];
  } catch {
    lista = [];
  }
  if (!lista.length) return { agregados: 0, pendientes: 0 };
  const r = await procesarAvisos(db, lista);
  if (r.procesados.length) {
    if (typeof modulo.confirmarCola === 'function') {
      modulo.confirmarCola(JSON.stringify(r.procesados.map((a) => ({ pkg: a.pkg, ts: a.ts, title: a.title ?? '', text: a.text ?? '' }))));
    }
    // Si el APK es antiguo (sin confirmarCola) NO se vacía: la base ya ignora los repetidos.
  }
  return r;
}

/** Escucha avisos en vivo (app abierta). Devuelve cómo dejar de escuchar. */
export function escucharAvisos(alLlegar: () => void): () => void {
  if (!Avisos) return () => {};
  const sub = Avisos.addListener('onAviso', alLlegar);
  return () => sub.remove();
}
