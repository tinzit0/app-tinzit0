/**
 * Nube (Supabase) — lógica pura, sin internet (probada en scripts/test-nube.ts).
 * - Qué parte de tus datos se respalda en la nube y qué se queda SOLO en el teléfono.
 * - Cómo se combina un respaldo de la nube con lo que queda en el teléfono al restaurar.
 * - Cómo se ve una racha (días, si está viva, si hoy está "por perderse").
 */
import type { ArchivoRespaldo, Fila } from '@/database/respaldoFormato';

/**
 * Tablas que NUNCA salen del teléfono:
 * Bienestar (tarjeta diaria, calma/impulsos), historial del asistente, textos crudos de avisos del banco
 * (los gastos sí se respaldan) y las visitas al campus (ubicación).
 */
export const TABLAS_SOLO_TELEFONO = ['diary_cards', 'calm_sessions', 'chat_messages', 'bank_alerts', 'campus_visits'] as const;

/** Ajustes que no salen del teléfono (plan de crisis, bloqueo con huella y el estado de la sincronización). */
export const AJUSTES_SOLO_TELEFONO = ['plan_crisis', 'bienestar_bloqueo', 'nube_ultimo_respaldo', 'nube_respaldo_cambios', 'checkins_pendientes', 'rachas_cache'];

const soloTelefono = new Set<string>(TABLAS_SOLO_TELEFONO);
const ajusteLocal = (f: Fila) => AJUSTES_SOLO_TELEFONO.includes(String(f.key));

function contar(tables: Record<string, Fila[]>) {
  return Object.fromEntries(Object.entries(tables).map(([t, filas]) => [t, filas.length]));
}

/** Lo que se sube a la nube: todo menos lo que se queda en el teléfono. */
export function paraLaNube(a: ArchivoRespaldo): ArchivoRespaldo {
  const tables: Record<string, Fila[]> = {};
  for (const [t, filas] of Object.entries(a.tables)) {
    if (soloTelefono.has(t)) continue;
    tables[t] = t === 'settings' ? filas.filter((f) => !ajusteLocal(f)) : filas;
  }
  return { ...a, tables, counts: contar(tables) };
}

/**
 * Al restaurar desde la nube: lo de la nube + lo que solo vive en este teléfono (Bienestar, etc.),
 * para no perderlo. El resultado es un respaldo completo que pasa la validación de siempre.
 */
export function combinarConLocal(nube: ArchivoRespaldo, local: ArchivoRespaldo): ArchivoRespaldo {
  const tables: Record<string, Fila[]> = {};
  for (const [t, filas] of Object.entries(nube.tables)) {
    if (soloTelefono.has(t)) continue; // por si acaso: la nube nunca pisa lo local
    tables[t] = t === 'settings' ? filas.filter((f) => !ajusteLocal(f)) : filas;
  }
  for (const t of TABLAS_SOLO_TELEFONO) {
    if (local.tables[t]) tables[t] = local.tables[t];
  }
  tables.settings = [...(tables.settings ?? []), ...(local.tables.settings ?? []).filter(ajusteLocal)];
  return { ...nube, tables, counts: contar(tables) };
}

/** ¿El teléfono está prácticamente vacío? (recién instalada la app). */
export function telefonoVacio(a: ArchivoRespaldo): boolean {
  const importantes = ['tasks', 'expenses', 'notes', 'workout_sets', 'courses', 'habits', 'savings_goals', 'piggy_movements', 'water_logs'];
  return importantes.every((t) => (a.tables[t]?.length ?? 0) === 0);
}

// ---------- Rachas ----------

export type Actividad = 'tareas' | 'gym' | 'agua';
export const ACTIVIDADES: { value: Actividad; label: string; detalle: string; icono: string }[] = [
  { value: 'tareas', label: 'Tareas del día', detalle: 'Completar todas las tareas de hoy', icono: 'checkmark-done-outline' },
  { value: 'gym', label: 'Gym', detalle: 'Entrenar (anotar al menos una serie)', icono: 'barbell-outline' },
  { value: 'agua', label: 'Meta de agua', detalle: 'Llegar a tu meta de agua', icono: 'water-outline' },
];
export const nombreActividad = (a: string) => ACTIVIDADES.find((x) => x.value === a)?.label ?? a;

export type Racha = { id: number; user_a: string; user_b: string; activity: Actividad; count: number; best: number; last_day: string | null };

export type EstadoRacha = {
  dias: number; // días que se ven (0 si ya se cortó)
  record: number;
  yoHoy: boolean;
  amigoHoy: boolean;
  /** La racha está viva pero hoy falta que alguno cumpla. */
  porMantener: boolean;
};

const menosUnDia = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d - 1);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

/** Estado de una racha para mostrarla. `hoy` es la fecha local 'YYYY-MM-DD'. */
export function estadoRacha(r: Pick<Racha, 'count' | 'best' | 'last_day'>, hoy: string, yoHoy: boolean, amigoHoy: boolean): EstadoRacha {
  const ayer = menosUnDia(hoy);
  const viva = !!r.last_day && r.last_day >= ayer;
  const dias = viva ? r.count : 0;
  return { dias, record: r.best, yoHoy, amigoHoy, porMantener: dias > 0 && r.last_day === ayer && !(yoHoy && amigoHoy) };
}

/** Mensaje amable (nunca culposo) para cada estado de la racha. */
export function mensajeRacha(e: EstadoRacha, amigo: string): string {
  if (e.yoHoy && e.amigoHoy) return `¡Hoy cumplieron los dos! 🔥`;
  if (e.porMantener) {
    if (e.yoHoy) return `Tú ya cumpliste. Falta ${amigo} para seguir la racha.`;
    if (e.amigoHoy) return `${amigo} ya cumplió. Si tú cumples hoy, suman otro día 🔥`;
    return 'Hoy pueden mantener la racha. ¡Vamos!';
  }
  if (e.dias === 0) {
    if (e.record > 0) return `Su récord es de ${e.record} ${e.record === 1 ? 'día' : 'días'}. Hoy es buen día para partir de nuevo.`;
    if (e.yoHoy) return `Tú ya cumpliste. Cuando ${amigo} cumpla, parte la racha.`;
    if (e.amigoHoy) return `${amigo} ya cumplió. Si tú cumples hoy, parte la racha.`;
    return 'Cuando los dos cumplan el mismo día, parte la racha.';
  }
  return 'Racha al día.';
}

/** Rachas de la caché que hoy siguen vivas pero todavía no suman el día (para el aviso de las 20:00). */
export function rachasPorMantener(cache: string | null, hoy: string): { amigo: string; dias: number; actividad: Actividad }[] {
  try {
    const c = JSON.parse(cache ?? 'null') as { rachas?: Racha[]; nombres?: Record<string, string>; yo?: string } | null;
    if (!c?.rachas || !c.yo) return [];
    return c.rachas
      .map((r) => ({ r, e: estadoRacha(r, hoy, false, false) }))
      .filter(({ e }) => e.porMantener)
      .map(({ r, e }) => ({ amigo: c.nombres?.[r.user_a === c.yo ? r.user_b : r.user_a] ?? 'tu amigo', dias: e.dias, actividad: r.activity }));
  } catch {
    return [];
  }
}

/** La racha viva más larga guardada en caché (para Inicio). null si no hay. */
export function mejorRachaDe(cache: string | null, hoy = new Date()): number | null {
  try {
    const c = JSON.parse(cache ?? 'null') as { rachas?: Racha[] } | null;
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const vivas = (c?.rachas ?? []).map((r) => estadoRacha(r, iso, false, false).dias).filter((d) => d > 0);
    return vivas.length ? Math.max(...vivas) : null;
  } catch {
    return null;
  }
}

/** Nombre de usuario válido: 3 a 20 letras minúsculas, números, punto o guion bajo. */
export function usuarioValido(u: string): boolean {
  return /^[a-z0-9_.]{3,20}$/.test(u);
}

/** Lo que escribió la persona → usuario (minúsculas, sin espacios ni tildes). */
export function limpiarUsuario(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
}
