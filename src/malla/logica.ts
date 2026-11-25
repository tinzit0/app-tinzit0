/**
 * Malla interactiva — lógica pura (probada en scripts/test-malla.ts).
 * Cada teléfono guarda SU malla: la de Ing. Civil Informática UBB viene incluida,
 * se puede bajar otra desde un link de mallapp.cl o armarla a mano.
 */
import { ICINF_UBB, ICINF_UBB_AREAS } from './icinfUbb';

export type EstadoMalla = 'pendiente' | 'cursando' | 'aprobado';

/** Un ramo de la malla tal como se importa (antes de guardarlo). `ref` es el id de origen para los prerrequisitos. */
export type RamoMallaNuevo = { ref: number; name: string; semester: number; credits: number; area: string | null; prereqs: number[] };

/** Un ramo guardado en la base (prereqs son ids de la tabla). */
export type RamoMalla = { id: number; name: string; semester: number; credits: number; area: string | null; prereqs: number[]; status: EstadoMalla };

export type Disponibilidad = 'aprobado' | 'cursando' | 'disponible' | 'bloqueado';

/** ¿Se puede tomar? Aprobado / cursando se respetan; si no, depende de si aprobaste todos los prerrequisitos. */
export function disponibilidad(r: Pick<RamoMalla, 'status' | 'prereqs'>, aprobados: Set<number>): Disponibilidad {
  if (r.status === 'aprobado') return 'aprobado';
  if (r.status === 'cursando') return 'cursando';
  return r.prereqs.every((p) => aprobados.has(p)) ? 'disponible' : 'bloqueado';
}

/** Prerrequisitos que te faltan para tomar un ramo. */
export function faltantes(r: Pick<RamoMalla, 'prereqs'>, todos: RamoMalla[]): RamoMalla[] {
  return r.prereqs.map((p) => todos.find((x) => x.id === p)).filter((x): x is RamoMalla => !!x && x.status !== 'aprobado');
}

/** Ramos que dependen de este (los que se "abren" al aprobarlo). */
export function abre(id: number, todos: RamoMalla[]): RamoMalla[] {
  return todos.filter((x) => x.prereqs.includes(id));
}

export function progreso(todos: RamoMalla[]) {
  const aprobados = todos.filter((r) => r.status === 'aprobado');
  const creditos = todos.reduce((s, r) => s + r.credits, 0);
  const creditosAprobados = aprobados.reduce((s, r) => s + r.credits, 0);
  return {
    aprobados: aprobados.length,
    total: todos.length,
    creditos,
    creditosAprobados,
    porcentaje: creditos > 0 ? Math.round((creditosAprobados / creditos) * 100) : todos.length ? Math.round((aprobados.length / todos.length) * 100) : 0,
  };
}

/**
 * La malla de Ing. Civil Informática UBB que viene con la app.
 * mallapp.cl marca algunos requisitos especiales con el id 999 (ej: un % de avance de la carrera);
 * esos no son un ramo, así que no se usan como prerrequisito.
 */
export function mallaIcinfUbb(): RamoMallaNuevo[] {
  const refs = new Set(ICINF_UBB.map((r) => r[0]));
  return ICINF_UBB.map(([ref, name, semester, credits, area, prereqs]) => ({
    ref,
    name,
    semester,
    credits,
    area: ICINF_UBB_AREAS[area] ?? null,
    prereqs: prereqs.filter((p) => refs.has(p)),
  }));
}

/**
 * Link de mallapp.cl → dirección del archivo con los datos.
 * "https://mallapp.cl/ues/ubiobio/ICINF" → "https://mallapp.cl/universidades/ubiobio/ICINF.json"
 * Devuelve null si el link no es de mallapp.
 */
export function urlDatosMallapp(link: string): string | null {
  const m = link.trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:mallapp\.cl|malla\.sbleit\.net)\/ues\/([\w-]+)\/([\w-]+)\/?(?:[?#].*)?$/i);
  if (!m) return null;
  return `https://mallapp.cl/universidades/${m[1]}/${m[2]}.json`;
}

/**
 * Revisa y convierte los datos bajados de mallapp.cl. Nunca confía a ciegas:
 * si algo viene raro, se descarta ese ramo o toda la malla (lanza un error con un mensaje para el usuario).
 */
export function leerMallapp(datos: unknown): RamoMallaNuevo[] {
  if (!Array.isArray(datos) || datos.length === 0) throw new Error('El link no trae una malla.');
  const ramos: RamoMallaNuevo[] = [];
  for (const d of datos.slice(0, 200)) {
    if (!d || typeof d !== 'object') continue;
    const x = d as Record<string, unknown>;
    const ref = Number(x.id);
    const name = typeof x.name === 'string' ? x.name.trim().slice(0, 80) : '';
    const semester = Number(x.semestre);
    if (!Number.isInteger(ref) || !name || !Number.isInteger(semester) || semester < 1 || semester > 20) continue;
    const credits = Number(x.sct ?? x.creditos ?? 0);
    const area = typeof x.area === 'string' ? x.area.replace(/^Área\s+/i, '').slice(0, 60) : null;
    const prereqs = Array.isArray(x.preRequisitos) ? x.preRequisitos.map(Number).filter((n) => Number.isInteger(n)) : [];
    ramos.push({ ref, name, semester, credits: Number.isFinite(credits) && credits >= 0 && credits < 100 ? Math.round(credits) : 0, area, prereqs });
  }
  if (!ramos.length) throw new Error('No pude leer los ramos de esa malla.');
  // Prerrequisitos que apuntan a ramos que no existen se ignoran.
  const refs = new Set(ramos.map((r) => r.ref));
  return ramos.map((r) => ({ ...r, prereqs: r.prereqs.filter((p) => refs.has(p) && p !== r.ref) }));
}

/** Agrupa por semestre (1, 2, 3…), en orden. */
export function porSemestre<T extends { semester: number }>(ramos: T[]): { semestre: number; ramos: T[] }[] {
  const mapa = new Map<number, T[]>();
  for (const r of ramos) mapa.set(r.semester, [...(mapa.get(r.semester) ?? []), r]);
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([semestre, rs]) => ({ semestre, ramos: rs }));
}

/** "1er año · 1er semestre" a partir del semestre corrido. */
export function nombreSemestre(n: number): string {
  return `Semestre ${n} · Año ${Math.ceil(n / 2)}`;
}
