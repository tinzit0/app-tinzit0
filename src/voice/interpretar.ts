/**
 * El "cerebro" del asistente, sin internet: convierte una frase en una intención.
 *
 *   "agrega una tarea: comprar pan mañana" → { tipo: 'agregar_tarea', titulo: 'comprar pan', fecha: mañana }
 *   "anota un gasto de 5 lucas en comida"  → { tipo: 'agregar_gasto', monto: 5000, categoria: 'comida' }
 *
 * Es una función pura (no toca la base de datos), así se puede probar fácil.
 * Si en el futuro agregamos un chat con IA, se usa cuando esto devuelve 'desconocido'.
 */
import { endOfWeek, toISODate, weekdayMonFirst } from '@/utils/fechas';
import { parseMonto } from '@/utils/montos';
import { normalizar, sinActivacion } from './texto';

export type Intencion =
  | { tipo: 'saludo' }
  | { tipo: 'ayuda' }
  | { tipo: 'gracias' }
  | { tipo: 'tareas_hoy' }
  | { tipo: 'tareas_semana' }
  | { tipo: 'agregar_tarea'; titulo: string; fecha: string | null; semanal: boolean; prioridad: 'alta' | 'media' | 'baja' }
  | { tipo: 'completar_tarea'; texto: string }
  | { tipo: 'agregar_gasto'; monto: number; categoria: string; nota: string | null }
  | { tipo: 'gasto_periodo'; periodo: 'semana' | 'mes' | 'hoy' }
  | { tipo: 'presupuesto' }
  | { tipo: 'gym_hoy' }
  | { tipo: 'racha'; texto: string }
  | { tipo: 'marcar_habito'; texto: string }
  | { tipo: 'abonar_meta'; monto: number; texto: string }
  | { tipo: 'metas' }
  | { tipo: 'ultimo_peso'; texto: string }
  | { tipo: 'desconocido'; texto: string };

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/** Palabras que delatan cada categoría de gasto. */
const CATEGORIAS: Record<string, string[]> = {
  comida: ['comida', 'almuerzo', 'almorce', 'cena', 'desayuno', 'once', 'super', 'supermercado', 'pan', 'completo', 'sushi', 'pizza', 'cafe', 'colacion', 'feria', 'verduras', 'carne', 'lider', 'jumbo', 'unimarc', 'delivery', 'pedidosya', 'rappi', 'hamburguesa', 'empanada', 'mote'],
  transporte: ['transporte', 'micro', 'metro', 'uber', 'didi', 'cabify', 'taxi', 'colectivo', 'bencina', 'combustible', 'peaje', 'estacionamiento', 'bip', 'pasaje', 'bus', 'biotren'],
  ocio: ['ocio', 'cine', 'carrete', 'copete', 'cerveza', 'chela', 'chelas', 'bar', 'juego', 'juegos', 'concierto', 'entrada', 'salida', 'videojuego', 'steam', 'regalo'],
  hogar: ['hogar', 'casa', 'arriendo', 'luz', 'agua', 'gas', 'internet', 'aseo', 'limpieza', 'mueble', 'gastos comunes', 'ferreteria'],
  salud: ['salud', 'farmacia', 'remedio', 'remedios', 'doctor', 'medico', 'consulta', 'dentista', 'examen', 'isapre', 'fonasa', 'gimnasio', 'gym', 'proteina'],
  suscripciones: ['suscripcion', 'suscripciones', 'netflix', 'spotify', 'youtube premium', 'disney', 'hbo', 'max', 'icloud', 'plan', 'celular', 'prime', 'chatgpt', 'claude'],
};

function detectarCategoria(t: string): string {
  for (const [cat, palabras] of Object.entries(CATEGORIAS)) {
    if (palabras.some((p) => new RegExp(`\\b${p}\\b`).test(t))) return cat;
  }
  return 'otros';
}

/** Busca una fecha en la frase: hoy, mañana, pasado mañana, el viernes, esta semana. */
function detectarFecha(t: string, hoy: Date): { fecha: string | null; semanal: boolean; resto: string } {
  let resto = t;
  const quitar = (re: RegExp) => (resto = resto.replace(re, ' ').replace(/\s+/g, ' ').trim());

  if (/\bpasado manana\b/.test(t)) {
    quitar(/\bpara pasado manana\b|\bpasado manana\b/);
    return { fecha: toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 2)), semanal: false, resto };
  }
  if (/\bmanana\b/.test(t)) {
    quitar(/\bpara manana\b|\bmanana\b/);
    return { fecha: toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1)), semanal: false, resto };
  }
  if (/\b(esta semana|en la semana|durante la semana)\b/.test(t)) {
    quitar(/\b(para )?(esta semana|en la semana|durante la semana)\b/);
    return { fecha: toISODate(endOfWeek(hoy)), semanal: true, resto };
  }
  const dia = DIAS.find((d) => new RegExp(`\\b(el |este |para el )?${d}\\b`).test(t));
  if (dia) {
    quitar(new RegExp(`\\b(para el |el |este )?${dia}\\b`));
    const objetivo = DIAS.indexOf(dia) + 1;
    let diff = objetivo - weekdayMonFirst(hoy);
    if (diff <= 0) diff += 7;
    return { fecha: toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diff)), semanal: false, resto };
  }
  if (/\bhoy\b/.test(t)) {
    quitar(/\b(para )?hoy\b/);
    return { fecha: toISODate(hoy), semanal: false, resto };
  }
  return { fecha: toISODate(hoy), semanal: false, resto };
}

const tiene = (t: string, ...res: RegExp[]) => res.some((r) => r.test(t));

export function interpretar(frase: string, hoy = new Date()): Intencion {
  const t = sinActivacion(frase);
  if (!t) return { tipo: 'saludo' };

  // --- Agregar tarea ---
  const mTarea =
    /^(?:agrega(?:me)?|agregar|anota(?:me)?|anotar|crea|crear|pon(?:me)?|nueva)\s+(?:una\s+)?(?:nueva\s+)?tarea\s*(?:de|para|que)?\s*(.+)$/.exec(t) ??
    /^(?:recuerdame|recordarme|tengo que|no me dejes olvidar)\s+(.+)$/.exec(t);
  if (mTarea) {
    let resto = mTarea[1];
    let prioridad: 'alta' | 'media' | 'baja' = 'media';
    if (/\b(urgente|importante|prioridad alta)\b/.test(resto)) {
      prioridad = 'alta';
      resto = resto.replace(/\b(es )?(urgente|importante|con prioridad alta|prioridad alta)\b/g, ' ');
    }
    const f = detectarFecha(resto, hoy);
    const titulo = f.resto.replace(/^(que|de|para)\s+/, '').trim();
    if (titulo) return { tipo: 'agregar_tarea', titulo, fecha: f.fecha, semanal: f.semanal, prioridad };
  }

  // --- Completar tarea ---
  const mHecha =
    /^(?:marca(?:r)?|marcame|pon(?:er)?)\s+(?:como\s+)?(?:hecha|lista|completa|completada|terminada)\s+(?:la\s+)?(?:tarea\s+)?(?:de\s+)?(.+)$/.exec(t) ??
    /^(?:marca(?:r)?)\s+(?:la\s+)?(?:tarea\s+)?(.+?)\s+(?:como\s+)?(?:hecha|lista|completa|completada|terminada)$/.exec(t) ??
    /^(?:ya\s+)?(?:termine|hice|complete|listo con|lista la tarea|lista)\s+(?:la\s+tarea\s+)?(?:de\s+)?(.+)$/.exec(t);
  if (mHecha && !/\b(gym|agua|leer|habito)\b/.test(mHecha[1])) {
    return { tipo: 'completar_tarea', texto: mHecha[1].trim() };
  }

  // --- Abonar a una meta (antes que gastos, porque también trae monto) ---
  if (tiene(t, /\b(abona|abonar|abonale|ahorra|ahorre|guarda|guarde|mete|agrega)\b.*\b(meta|ahorro|alcancia)\b/, /\babon[ae]\b/)) {
    const monto = parseMonto(t);
    if (monto) return { tipo: 'abonar_meta', monto, texto: t.replace(/.*\b(meta|para)\b/, '').trim() };
  }

  // --- Agregar gasto ---
  if (tiene(t, /\b(gaste|gasto de|anota un gasto|anota gasto|anotame un gasto|registra un gasto|agrega un gasto|pague|compre|me gaste)\b/)) {
    const monto = parseMonto(t);
    if (monto) {
      const categoria = detectarCategoria(t);
      const mNota = /\ben\s+(?:el\s+|la\s+|un\s+|una\s+)?([a-z ]+)$/.exec(t);
      let nota = mNota ? mNota[1].trim() : null;
      if (nota && (nota === categoria || /^(comida|transporte|ocio|hogar|salud|suscripciones|otros)$/.test(nota))) nota = null;
      return { tipo: 'agregar_gasto', monto, categoria, nota };
    }
  }

  // --- Consultas de plata ---
  if (tiene(t, /\bcuanto\b.*\b(gaste|gastado|llevo|he gastado|gastamos)\b/, /\b(gastos|gasto) (de|del|esta|este)\b/)) {
    if (/\bmes\b/.test(t)) return { tipo: 'gasto_periodo', periodo: 'mes' };
    if (/\bhoy\b/.test(t)) return { tipo: 'gasto_periodo', periodo: 'hoy' };
    return { tipo: 'gasto_periodo', periodo: 'semana' };
  }
  if (tiene(t, /\bpresupuesto\b/, /\bcuanto me queda\b/)) return { tipo: 'presupuesto' };
  if (tiene(t, /\b(como van|como va|cuanto llevo en) (mis |mi )?metas?\b/, /\bmis metas\b/)) return { tipo: 'metas' };

  // --- Gym y cuerpo ---
  if (tiene(t, /\bcuanto (peso|pese|levante|hice)\b/, /\bultim[oa] (peso|vez).*(marque|levante|pese)\b/, /\bpeso marque\b/)) {
    return { tipo: 'ultimo_peso', texto: t };
  }
  if (tiene(t, /\b(gym|gimnasio|entreno|entrenamiento|rutina)\b/)) return { tipo: 'gym_hoy' };

  // --- Hábitos ---
  if (tiene(t, /\bracha\b/, /\bdias seguidos\b/)) return { tipo: 'racha', texto: t };
  const mHab = /^(?:marca(?:r)?\s+(?:el\s+)?habito\s+(?:de\s+)?|ya\s+(?:tome|lei|medite|camine|estire|dormi)\s*)(.*)$/.exec(t);
  if (mHab) return { tipo: 'marcar_habito', texto: t.replace(/^marca(r)?\s+(el\s+)?habito\s+(de\s+)?/, '') };

  // --- Tareas ---
  if (tiene(t, /\btareas?\b/, /\bque (tengo|me falta|me queda|hay) (que hacer|pendiente)/, /\bpendientes?\b/)) {
    if (/\bsemana\b/.test(t)) return { tipo: 'tareas_semana' };
    return { tipo: 'tareas_hoy' };
  }
  if (/^y (esta |la )?semana$/.test(t)) return { tipo: 'tareas_semana' };

  // --- Charla ---
  if (tiene(t, /^(hola|buenas|buenos dias|buenas tardes|buenas noches|que tal|como estai|como estas)\b/)) return { tipo: 'saludo' };
  if (tiene(t, /\b(gracias|vale|bacan|buena|genial)\b/)) return { tipo: 'gracias' };
  if (tiene(t, /\b(ayuda|que puedes hacer|que sabes hacer|que te puedo pedir|comandos)\b/)) return { tipo: 'ayuda' };

  return { tipo: 'desconocido', texto: normalizar(frase) };
}

/** Ejemplos que se muestran cuando no entiende o pides ayuda. */
export const EJEMPLOS = [
  '¿Qué tareas me faltan hoy?',
  'Agrega una tarea: comprar pan mañana',
  'Anota un gasto de 5 lucas en comida',
  '¿Cuánto he gastado esta semana?',
  '¿Qué me toca hoy en el gym?',
  '¿Cómo va mi racha?',
  'Abona 10 lucas a mi meta',
];
