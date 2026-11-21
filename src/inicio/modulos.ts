/**
 * Módulos de la pantalla Inicio: cuáles se ven y en qué orden (puro: se prueba en Node).
 * Se guarda en el ajuste "inicio_modulos" como [{ id, visible }].
 * Si una versión nueva agrega un módulo, aparece al final (visible) sin perder tu orden.
 */

export type IdModulo = 'rapido' | 'clima' | 'tareas' | 'gymGastos' | 'estadisticas' | 'estudio' | 'bienestar' | 'musica' | 'habitos' | 'apps';

export const MODULOS: { id: IdModulo; nombre: string; detalle: string }[] = [
  { id: 'rapido', nombre: 'Acceso rápido', detalle: 'Nueva tarea, gasto o nota con un toque' },
  { id: 'clima', nombre: 'Clima', detalle: 'El tiempo de hoy' },
  { id: 'tareas', nombre: 'Tareas de hoy', detalle: 'Cuántas te quedan' },
  { id: 'gymGastos', nombre: 'Gym y gastos', detalle: 'Rutina de hoy y gasto de la semana' },
  { id: 'estadisticas', nombre: 'Tu mes en números', detalle: 'Acceso a estadísticas' },
  { id: 'estudio', nombre: 'Estudio', detalle: 'Próxima clase y prueba' },
  { id: 'bienestar', nombre: 'Bienestar', detalle: 'Ánimo de hoy y "Estoy a mil"' },
  { id: 'musica', nombre: 'Música', detalle: 'Acceso a Spotify' },
  { id: 'habitos', nombre: 'Hábitos', detalle: 'Marca tus hábitos del día' },
  { id: 'apps', nombre: 'Tus apps', detalle: 'Accesos a apps favoritas' },
];

export type ModuloInicio = { id: IdModulo; visible: boolean };

const IDS = new Set(MODULOS.map((m) => m.id));

export function porDefecto(): ModuloInicio[] {
  return MODULOS.map((m) => ({ id: m.id, visible: true }));
}

/** Lee lo guardado y lo completa con los módulos nuevos. Si está dañado, usa el orden por defecto. */
export function leerModulos(raw: string | null | undefined): ModuloInicio[] {
  let guardado: unknown = null;
  try {
    guardado = raw ? JSON.parse(raw) : null;
  } catch {
    guardado = null;
  }
  if (!Array.isArray(guardado)) return porDefecto();
  const vistos = new Set<string>();
  const out: ModuloInicio[] = [];
  for (const x of guardado) {
    if (!x || typeof x !== 'object') continue;
    const id = (x as { id?: unknown }).id;
    if (typeof id !== 'string' || !IDS.has(id as IdModulo) || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ id: id as IdModulo, visible: (x as { visible?: unknown }).visible !== false });
  }
  for (const m of MODULOS) if (!vistos.has(m.id)) out.push({ id: m.id, visible: true });
  return out;
}

/** Sube (-1) o baja (+1) un módulo. */
export function mover(lista: ModuloInicio[], id: IdModulo, delta: -1 | 1): ModuloInicio[] {
  const i = lista.findIndex((m) => m.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

export function alternar(lista: ModuloInicio[], id: IdModulo): ModuloInicio[] {
  return lista.map((m) => (m.id === id ? { ...m, visible: !m.visible } : m));
}
