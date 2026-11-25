/**
 * Agua — lógica pura (probada en scripts/test-agua.ts).
 * Meta diaria, tamaño del vaso y recordatorios cada X minutos dentro de un horario activo.
 */

export type AjustesAgua = {
  metaMl: number; // ej: 2000
  vasoMl: number; // ej: 250
  avisos: boolean;
  cadaMin: number; // ej: 90
  desde: string; // 'HH:MM'
  hasta: string; // 'HH:MM'
  pausaHasta: string | null; // fecha y hora ISO local; null = sin pausa
};

export const AGUA_POR_DEFECTO: AjustesAgua = { metaMl: 2000, vasoMl: 250, avisos: true, cadaMin: 90, desde: '08:00', hasta: '22:00', pausaHasta: null };

const aMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** Lee los ajustes guardados (texto) con valores sanos aunque vengan raros. */
export function leerAjustesAgua(s: Partial<Record<keyof AjustesAgua, string | null>>): AjustesAgua {
  const num = (v: string | null | undefined, def: number, min: number, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : def;
  };
  const hora = (v: string | null | undefined, def: string) => (v && /^\d{2}:\d{2}$/.test(v) && aMin(v) < 24 * 60 ? v : def);
  return {
    metaMl: num(s.metaMl, AGUA_POR_DEFECTO.metaMl, 250, 8000),
    vasoMl: num(s.vasoMl, AGUA_POR_DEFECTO.vasoMl, 50, 2000),
    avisos: s.avisos !== '0',
    cadaMin: num(s.cadaMin, AGUA_POR_DEFECTO.cadaMin, 15, 600),
    desde: hora(s.desde, AGUA_POR_DEFECTO.desde),
    hasta: hora(s.hasta, AGUA_POR_DEFECTO.hasta),
    pausaHasta: s.pausaHasta && !Number.isNaN(new Date(s.pausaHasta).getTime()) ? s.pausaHasta : null,
  };
}

/**
 * Horas del recordatorio en un día: desde "desde" cada "cadaMin" hasta "hasta" (incluida).
 * El primer aviso es "cadaMin" después de empezar (al despertar no hace falta que te recuerde al tiro).
 * Si "hasta" es menor que "desde" (ej: 22:00 → 01:00), el horario cruza la medianoche.
 */
export function horasRecordatorio(a: Pick<AjustesAgua, 'desde' | 'hasta' | 'cadaMin'>, dia: Date): Date[] {
  const ini = aMin(a.desde);
  let fin = aMin(a.hasta);
  if (fin <= ini) fin += 24 * 60;
  const out: Date[] = [];
  for (let t = ini + a.cadaMin; t <= fin && out.length < 48; t += a.cadaMin) {
    out.push(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 0, t, 0, 0));
  }
  return out;
}

/** ¿Este recordatorio cae dentro de una pausa? */
export function enPausa(cuando: Date, pausaHasta: string | null): boolean {
  if (!pausaHasta) return false;
  return cuando.getTime() < new Date(pausaHasta).getTime();
}

export function progresoAgua(ml: number, metaMl: number) {
  const ratio = metaMl > 0 ? ml / metaMl : 0;
  return { ml, metaMl, ratio, porcentaje: Math.round(Math.min(1, ratio) * 100), cumplida: ml >= metaMl, faltan: Math.max(0, metaMl - ml) };
}

/** "1.250 ml" o "1,5 L" para mostrar. */
export function formatoMl(ml: number): string {
  if (ml >= 1000 && ml % 100 === 0) return `${(ml / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} L`;
  return `${ml.toLocaleString('es-CL')} ml`;
}

/** Cuántos vasos hacen falta para la meta. */
export function vasosParaMeta(metaMl: number, vasoMl: number): number {
  return vasoMl > 0 ? Math.ceil(metaMl / vasoMl) : 0;
}
