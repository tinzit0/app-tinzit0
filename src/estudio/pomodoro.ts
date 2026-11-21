/**
 * Lógica del Pomodoro (pura: se prueba en scripts/test-estudio2.ts).
 *
 * La sesión se guarda en la base (ajuste "pomodoro_sesion"), así sobrevive a salir de la pantalla,
 * cerrar la app o reiniciar el celular:
 * - corriendo: `finEn` = hora exacta en que termina la fase.
 * - en pausa: `finEn` = null y `restante` = lo que faltaba.
 * Cada bloque de enfoque tiene un `id`: se registra como estudio UNA sola vez (ver registrarBloque).
 */

export type Fase = 'enfoque' | 'descanso';
export type Modo = '25' | '50' | '15';
export const MODOS: Record<Modo, { enfoque: number; descanso: number }> = {
  '25': { enfoque: 25, descanso: 5 },
  '50': { enfoque: 50, descanso: 10 },
  '15': { enfoque: 15, descanso: 3 },
};

export type SesionPomodoro = {
  /** Identifica el bloque actual (cambia en cada fase nueva). */
  id: string;
  fase: Fase;
  modo: Modo;
  ramo: number | null;
  finEn: number | null;
  restante: number;
  /** Bloques de enfoque terminados en esta sesión. */
  ciclos: number;
};

export const duracionFase = (f: Fase, m: Modo) => MODOS[m][f] * 60_000;
const nuevoId = (ahora: number) => `${ahora.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export function sesionNueva(modo: Modo, ramo: number | null, ahora = Date.now()): SesionPomodoro {
  return { id: nuevoId(ahora), fase: 'enfoque', modo, ramo, finEn: null, restante: duracionFase('enfoque', modo), ciclos: 0 };
}

export function iniciar(s: SesionPomodoro, ahora = Date.now()): SesionPomodoro {
  if (s.finEn != null) return s;
  return { ...s, finEn: ahora + s.restante };
}

export function pausar(s: SesionPomodoro, ahora = Date.now()): SesionPomodoro {
  if (s.finEn == null) return s;
  return { ...s, restante: Math.max(0, s.finEn - ahora), finEn: null };
}

export function restante(s: SesionPomodoro, ahora = Date.now()): number {
  return s.finEn == null ? s.restante : Math.max(0, s.finEn - ahora);
}

/** Pasa a la otra fase (en pausa). */
export function saltar(s: SesionPomodoro, ahora = Date.now()): SesionPomodoro {
  const sig: Fase = s.fase === 'enfoque' ? 'descanso' : 'enfoque';
  return { ...s, id: nuevoId(ahora), fase: sig, finEn: null, restante: duracionFase(sig, s.modo) };
}

export type BloqueTerminado = { id: string; ramo: number | null; minutos: number };

/**
 * Avanza la sesión según la hora: si terminó el enfoque, lo devuelve para registrarlo y empieza
 * el descanso (desde la hora en que terminó, aunque hayas vuelto mucho después). Si terminó el
 * descanso, queda listo para el siguiente enfoque, en pausa.
 */
export function avanzar(s: SesionPomodoro, ahora = Date.now()): { sesion: SesionPomodoro; terminado: BloqueTerminado | null; cambio: boolean } {
  if (s.finEn == null || ahora < s.finEn) return { sesion: s, terminado: null, cambio: false };
  if (s.fase === 'enfoque') {
    const terminado: BloqueTerminado = { id: s.id, ramo: s.ramo, minutos: MODOS[s.modo].enfoque };
    const finDescanso = s.finEn + duracionFase('descanso', s.modo);
    const descanso: SesionPomodoro = { ...s, id: nuevoId(ahora), fase: 'descanso', finEn: finDescanso, restante: duracionFase('descanso', s.modo), ciclos: s.ciclos + 1 };
    // Si también terminó el descanso mientras no estabas: queda listo para otro enfoque.
    if (ahora >= finDescanso) {
      return { sesion: { ...descanso, fase: 'enfoque', finEn: null, restante: duracionFase('enfoque', s.modo) }, terminado, cambio: true };
    }
    return { sesion: descanso, terminado, cambio: true };
  }
  return { sesion: { ...s, id: nuevoId(ahora), fase: 'enfoque', finEn: null, restante: duracionFase('enfoque', s.modo) }, terminado: null, cambio: true };
}

/** Al terminar antes: minutos de enfoque hechos (solo cuenta si fueron 5 o más). */
export function minutosHechos(s: SesionPomodoro, ahora = Date.now()): number {
  if (s.fase !== 'enfoque') return 0;
  const hechos = Math.floor((duracionFase('enfoque', s.modo) - restante(s, ahora)) / 60_000);
  return hechos >= 5 ? hechos : 0;
}

/** Lee una sesión guardada (o null si está dañada). */
export function leerSesion(raw: string | null): SesionPomodoro | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SesionPomodoro;
    if (!s || typeof s.id !== 'string' || !(s.modo in MODOS) || (s.fase !== 'enfoque' && s.fase !== 'descanso')) return null;
    if (typeof s.restante !== 'number' || (s.finEn != null && typeof s.finEn !== 'number')) return null;
    return { ...s, ciclos: s.ciclos ?? 0, ramo: s.ramo ?? null };
  } catch {
    return null;
  }
}
