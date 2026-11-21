/**
 * Internet con límite de tiempo: si el servidor no responde, se corta en vez de dejar la app esperando.
 */

/** fetch que se cancela solo después de `ms` milisegundos (por defecto 10 s). */
export async function fetchConLimite(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const control = new AbortController();
  const externo = init.signal;
  const alAbortar = () => control.abort();
  externo?.addEventListener('abort', alAbortar);
  const t = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: control.signal });
  } catch (e) {
    if (control.signal.aborted && !externo?.aborted) throw new Error('Sin respuesta (tiempo agotado). Revisa tu conexión.');
    throw e;
  } finally {
    clearTimeout(t);
    externo?.removeEventListener('abort', alAbortar);
  }
}

/** Espera una promesa como máximo `ms`; si tarda más, devuelve `porDefecto` (la promesa sigue sola). */
export function conLimite<T>(p: Promise<T>, ms: number, porDefecto: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(porDefecto), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(porDefecto);
      },
    );
  });
}
