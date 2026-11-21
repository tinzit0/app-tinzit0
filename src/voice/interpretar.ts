/**
 * El "cerebro" del asistente, sin internet: convierte una frase en una intención.
 *
 *   "agrega una tarea: comprar pan mañana"      → agregar_tarea
 *   "anota un gasto de 5 lucas en comida"        → agregar_gasto
 *   "hice 3 series de 10 de press banca con 40"  → registrar_serie
 *   "¿va a llover mañana?"                       → clima
 *   "¿y mañana?" (después de preguntar el clima) → clima de mañana (usa el contexto)
 *
 * Es una función pura (no toca la base de datos), así se puede probar fácil.
 * Si la IA (Claude) está activada, ella entiende las frases; esto queda como
 * respaldo sin internet.
 */
import { endOfWeek, toISODate, weekdayMonFirst } from '@/utils/fechas';
import { parseMonto } from '@/utils/montos';
import { reglasApps, type IntencionApps } from './reglasApps';
import { reglasEstudio, type IntencionEstudio } from './reglasEstudio';
import { reglasFinanzas, type IntencionFinanzas } from './reglasFinanzas';
import { reglasExtra, type IntencionExtra } from './reglasExtra';
import { normalizar, sinActivacion } from './texto';

export type Prioridad = 'alta' | 'media' | 'baja';

export type Intencion =
  | { tipo: 'saludo' }
  | { tipo: 'ayuda' }
  | { tipo: 'gracias' }
  | { tipo: 'motivacion' }
  | { tipo: 'fecha_hora'; que: 'hora' | 'fecha' }
  | { tipo: 'resumen' }
  // Tareas
  | { tipo: 'tareas_hoy' }
  | { tipo: 'tareas_semana' }
  | { tipo: 'tareas_dia'; fecha: string }
  | { tipo: 'agregar_tarea'; titulo: string; fecha: string | null; semanal: boolean; prioridad: Prioridad }
  | { tipo: 'completar_tarea'; texto: string }
  | { tipo: 'mover_tarea'; texto: string; fecha: string }
  | { tipo: 'eliminar_tarea'; texto: string }
  // Plata
  | { tipo: 'agregar_gasto'; monto: number; categoria: string; nota: string | null }
  | { tipo: 'borrar_ultimo_gasto' }
  | { tipo: 'gasto_periodo'; periodo: 'semana' | 'mes' | 'hoy' }
  | { tipo: 'gasto_categoria'; categoria: string; periodo: 'semana' | 'mes' }
  | { tipo: 'ultimos_gastos'; periodo: 'hoy' | 'semana' }
  | { tipo: 'presupuesto' }
  | { tipo: 'cambiar_presupuesto'; monto: number }
  | { tipo: 'metas' }
  | { tipo: 'abonar_meta'; monto: number; texto: string }
  | { tipo: 'crear_meta'; nombre: string; monto: number }
  // Gym y cuerpo
  | { tipo: 'gym_hoy' }
  | { tipo: 'registrar_serie'; ejercicio: string; series: number; reps: number; peso: number }
  | { tipo: 'registrar_peso'; kg: number }
  | { tipo: 'ultimo_peso'; texto: string }
  // Hábitos
  | { tipo: 'racha'; texto: string }
  | { tipo: 'marcar_habito'; texto: string }
  | { tipo: 'crear_habito'; nombre: string }
  // Notas
  | { tipo: 'crear_nota'; texto: string }
  | { tipo: 'leer_notas' }
  // Otros
  | { tipo: 'clima'; cuando: 'ahora' | 'hoy' | 'semana' | 'fecha'; fecha: string | null; foco: 'lluvia' | 'temperatura' | null }
  | { tipo: 'recordatorio'; texto: string; segundos: number; hora: string | null }
  | { tipo: 'abrir'; destino: string }
  // Interfaz holográfica (modo Jarvis)
  | { tipo: 'tema_hud'; color: ColorHud }
  | { tipo: 'efecto_hud'; efecto: 'scan' | 'pulse' }
  | { tipo: 'estado_sistema' }
  | { tipo: 'fin_conversacion' }
  | IntencionExtra
  | IntencionApps
  | IntencionEstudio
  | IntencionFinanzas
  | { tipo: 'desconocido'; texto: string };

export type ColorHud = 'cian' | 'rojo' | 'azul' | 'verde' | 'morado' | 'naranjo' | 'dorado' | 'blanco' | 'rosado' | 'lima' | 'defecto';

export type TipoIntencion = Intencion['tipo'];

/** Lo último que se habló, para entender preguntas como "¿y mañana?". */
export type Contexto = {
  ultimo?: TipoIntencion | null;
  /** Si la respuesta anterior fue "¿Quisiste decir…?": las opciones y la frase original. */
  sugerencias?: { comando: string; etiqueta: string; puntaje: number }[];
  pendiente?: string;
};

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/** Palabras que delatan cada categoría de gasto. */
const CATEGORIAS: Record<string, string[]> = {
  comida: ['comida', 'almuerzo', 'almorce', 'cena', 'desayuno', 'once', 'super', 'supermercado', 'pan', 'completo', 'sushi', 'pizza', 'cafe', 'colacion', 'feria', 'verduras', 'carne', 'lider', 'jumbo', 'unimarc', 'delivery', 'pedidosya', 'rappi', 'hamburguesa', 'empanada', 'mote', 'comer', 'tottus', 'santa isabel', 'acuenta', 'mayorista', 'ok market', 'oxxo', 'mcdonalds', 'burger king', 'starbucks', 'dominos', 'kfc', 'subway', 'doggis', 'juan maestro', 'telepizza', 'restaurant', 'restaurante', 'panaderia', 'minimarket', 'botilleria', 'uber eats', 'justo'],
  transporte: ['transporte', 'micro', 'metro', 'uber', 'didi', 'cabify', 'taxi', 'colectivo', 'bencina', 'combustible', 'peaje', 'estacionamiento', 'bip', 'pasaje', 'bus', 'biotren', 'copec', 'shell', 'aramco', 'petrobras', 'enex', 'turbus', 'pullman', 'latam', 'sky airline', 'jetsmart', 'autopista', 'tag'],
  ocio: ['ocio', 'cine', 'carrete', 'copete', 'cerveza', 'chela', 'chelas', 'bar', 'juego', 'juegos', 'concierto', 'entrada', 'salida', 'videojuego', 'steam', 'regalo', 'cinemark', 'cineplanet', 'ticketmaster', 'puntoticket', 'passline', 'zara', 'aliexpress', 'temu', 'shein', 'mercadolibre'],
  hogar: ['hogar', 'casa', 'arriendo', 'luz', 'agua', 'gas', 'internet', 'aseo', 'limpieza', 'mueble', 'gastos comunes', 'ferreteria'],
  salud: ['salud', 'farmacia', 'remedio', 'remedios', 'doctor', 'medico', 'consulta', 'dentista', 'examen', 'isapre', 'fonasa', 'gimnasio', 'proteina', 'cruz verde', 'salcobrand', 'ahumada', 'dr simi', 'clinica', 'smartfit', 'pacific'],
  suscripciones: ['suscripcion', 'suscripciones', 'netflix', 'spotify', 'youtube premium', 'disney', 'hbo', 'max', 'icloud', 'plan', 'celular', 'prime', 'chatgpt', 'claude', 'netflix com', 'google', 'apple com', 'entel', 'movistar', 'wom', 'claro', 'vtr', 'crunchyroll', 'paramount', 'playstation', 'xbox'],
};

export function detectarCategoria(t: string): string {
  for (const [cat, palabras] of Object.entries(CATEGORIAS)) {
    if (palabras.some((p) => new RegExp(`\\b${p}\\b`).test(t))) return cat;
  }
  return 'otros';
}

/** "tres" → 3, "diez" → 10 … (para series, reps, minutos). */
const NUM: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
};

/** Reemplaza números escritos con palabras por dígitos (solo para series/reps/minutos). */
function digitos(t: string) {
  return t
    .replace(/\b(veinti)(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, (_, __, u) => String(20 + NUM[u]))
    .replace(/\b(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa) y (uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g, (_, d, u) => String(NUM[d] + NUM[u]))
    .replace(/\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)\b/g, (w) => String(NUM[w]))
    .replace(/(\d),(\d)/g, '$1.$2');
}

/** Busca una fecha en la frase: hoy, mañana, pasado mañana, el viernes, esta semana. */
export function detectarFecha(t: string, hoy: Date): { fecha: string | null; semanal: boolean; resto: string; encontrada: boolean } {
  let resto = t;
  const quitar = (re: RegExp) => (resto = resto.replace(re, ' ').replace(/\s+/g, ' ').trim());
  const mas = (n: number) => toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n));

  if (/\bpasado manana\b/.test(t)) {
    quitar(/\b(para )?pasado manana\b/);
    return { fecha: mas(2), semanal: false, resto, encontrada: true };
  }
  if (/\bmanana\b/.test(t)) {
    quitar(/\b(para )?manana\b/);
    return { fecha: mas(1), semanal: false, resto, encontrada: true };
  }
  if (/\b(esta semana|en la semana|durante la semana)\b/.test(t)) {
    quitar(/\b(para )?(esta semana|en la semana|durante la semana)\b/);
    return { fecha: toISODate(endOfWeek(hoy)), semanal: true, resto, encontrada: true };
  }
  const dia = DIAS.find((d) => new RegExp(`\\b(el |este |para el )?${d}\\b`).test(t));
  if (dia) {
    quitar(new RegExp(`\\b(para el |el |este )?${dia}\\b`));
    let diff = DIAS.indexOf(dia) + 1 - weekdayMonFirst(hoy);
    if (diff <= 0) diff += 7;
    return { fecha: mas(diff), semanal: false, resto, encontrada: true };
  }
  if (/\bhoy\b/.test(t)) {
    quitar(/\b(para )?hoy\b/);
    return { fecha: mas(0), semanal: false, resto, encontrada: true };
  }
  return { fecha: mas(0), semanal: false, resto, encontrada: false };
}

const tiene = (t: string, ...res: RegExp[]) => res.some((r) => r.test(t));
const limpiarArticulo = (s: string) => s.replace(/^(el|la|los|las|un|una|mi|mis)\s+/, '').trim();

// ---------- Reglas por tema (cada una devuelve una intención o null) ----------

function reglaRecordatorio(t: string, hoy: Date): Intencion | null {
  if (!/^(recuerdame|recordarme|avisame|acuerdame)\b/.test(t)) return null;
  const s = digitos(t);
  // "en 20 minutos", "dentro de una hora", "en media hora"
  const mRel = /\b(?:en|dentro de)\s+(media hora|una hora|un minuto|\d+(?:\.\d+)?)\s*(minutos?|mins?|horas?)?\b/.exec(s);
  // "a las 18:30", "a las 6 de la tarde", "a las 7 pm"
  const mHora = /\ba las (\d{1,2})(?::(\d{2}))?\s*(de la tarde|de la noche|pm|de la manana|am)?\b/.exec(s);
  if (!mRel && !mHora) return null;

  let segundos = 0;
  let hora: string | null = null;
  let resto = s;
  if (mRel) {
    resto = resto.replace(mRel[0], ' ');
    if (mRel[1] === 'media hora') segundos = 1800;
    else if (mRel[1] === 'una hora') segundos = 3600;
    else if (mRel[1] === 'un minuto') segundos = 60;
    else segundos = Math.round(Number(mRel[1]) * (/^hora/.test(mRel[2] ?? '') ? 3600 : 60));
  } else if (mHora) {
    resto = resto.replace(mHora[0], ' ');
    let h = Number(mHora[1]);
    const m = Number(mHora[2] ?? 0);
    const tarde = /tarde|noche|pm/.test(mHora[3] ?? '');
    if (tarde && h < 12) h += 12;
    // "a las 6" sin am/pm: si ya pasaron las 6 de la mañana, se entiende de la tarde.
    if (!mHora[3] && h < 12 && h <= hoy.getHours()) h += 12;
    const objetivo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), h, m);
    if (objetivo.getTime() <= hoy.getTime()) objetivo.setDate(objetivo.getDate() + 1);
    segundos = Math.round((objetivo.getTime() - hoy.getTime()) / 1000);
    hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const texto = resto
    .replace(/^(recuerdame|recordarme|avisame|acuerdame)\s*/, '')
    .replace(/^(que|de|para)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto || segundos <= 0) return null;
  return { tipo: 'recordatorio', texto, segundos, hora };
}

function reglaTareas(t: string, hoy: Date): Intencion | null {
  // Agregar
  const mTarea =
    /^(?:agrega(?:me)?|agregar|anota(?:me)?|anotar|crea|crear|pon(?:me)?|nueva)\s+(?:una\s+)?(?:nueva\s+)?tarea\s*(?:de|para|que)?\s*(.+)$/.exec(t) ??
    /^(?:recuerdame|recordarme|tengo que|no me dejes olvidar)\s+(.+)$/.exec(t);
  if (mTarea) {
    let resto = mTarea[1];
    let prioridad: Prioridad = 'media';
    if (/\b(urgente|importante|prioridad alta)\b/.test(resto)) {
      prioridad = 'alta';
      resto = resto.replace(/\b(es )?(urgente|importante|con prioridad alta|prioridad alta)\b/g, ' ');
    }
    const f = detectarFecha(resto, hoy);
    const titulo = f.resto.replace(/^(que|de|para)\s+/, '').trim();
    if (titulo) return { tipo: 'agregar_tarea', titulo, fecha: f.fecha, semanal: f.semanal, prioridad };
  }

  // Eliminar
  const mBorrar = /^(?:borra|borrar|elimina|eliminar|quita|saca)\s+(?:la\s+)?tarea\s+(?:de\s+)?(.+)$/.exec(t);
  if (mBorrar) return { tipo: 'eliminar_tarea', texto: mBorrar[1] };

  // Mover a otro día
  const mMover = /^(?:mueve|mover|pasa|pasar|cambia|posterga|postergar|deja)\s+(?:la\s+)?(?:tarea\s+)?(?:de\s+)?(.+?)\s+(?:para|al|a)\s+(.+)$/.exec(t);
  if (mMover) {
    const f = detectarFecha(mMover[2], hoy);
    if (f.encontrada && f.fecha) return { tipo: 'mover_tarea', texto: mMover[1], fecha: f.fecha };
  }

  // Completar
  const mHecha =
    /^(?:marca(?:r)?|marcame|pon(?:er)?)\s+(?:como\s+)?(?:hecha|lista|completa|completada|terminada)\s+(?:la\s+)?(?:tarea\s+)?(?:de\s+)?(.+)$/.exec(t) ??
    /^(?:marca(?:r)?)\s+(?:la\s+)?(?:tarea\s+)?(.+?)\s+(?:como\s+)?(?:hecha|lista|completa|completada|terminada)$/.exec(t) ??
    /^(?:ya\s+)?(?:termine|hice|complete|listo con|lista la tarea|lista)\s+(?:la\s+tarea\s+)?(?:de\s+)?(.+)$/.exec(t);
  if (mHecha && !/\b(gym|agua|leer|habito|series?|reps|repeticiones|kilos|kg)\b/.test(mHecha[1])) {
    return { tipo: 'completar_tarea', texto: mHecha[1].trim() };
  }
  return null;
}

function reglaPlata(t: string): Intencion | null {
  // Borrar el último gasto
  if (tiene(t, /\b(borra|elimina|quita|anula|borrar)\b.*\b(ultimo gasto|gasto anterior|ese gasto|el gasto)\b/, /\bme equivoque (en|con) el gasto\b/)) {
    return { tipo: 'borrar_ultimo_gasto' };
  }
  // Cambiar presupuesto
  if (/\bpresupuesto\b/.test(t) && /\b(cambia|cambiar|pon|ponme|deja|ajusta|sube|subir|baja|bajar|fija|nuevo)\b/.test(t)) {
    const monto = parseMonto(t);
    if (monto) return { tipo: 'cambiar_presupuesto', monto };
  }
  // Crear meta
  const mMeta = /^(?:quiero ahorrar|quiero juntar|crea(?:me)? una meta|nueva meta|crear una meta|ponme una meta)\s+(?:de\s+)?(.+)$/.exec(t);
  if (mMeta) {
    const monto = parseMonto(mMeta[1]);
    const nombre = limpiarArticulo((/\b(?:para|pa)\s+(.+)$/.exec(mMeta[1])?.[1] ?? mMeta[1].replace(/[\d.]+\s*(lucas?|mil|pesos|palos?)?/g, '')).trim());
    if (monto && nombre) return { tipo: 'crear_meta', nombre, monto };
  }
  // Abonar a una meta (antes que gastos, porque también trae monto)
  if (tiene(t, /\b(abona|abonar|abonale|ahorra|ahorre|guarda|guarde|mete|agrega)\b.*\b(meta|ahorro|alcancia)\b/, /\babon[ae]\b/)) {
    const monto = parseMonto(t);
    if (monto) return { tipo: 'abonar_meta', monto, texto: t.replace(/.*\b(meta|para)\b/, '').trim() };
  }
  // Agregar gasto
  if (tiene(t, /\b(gaste|gasto de|anota un gasto|anota gasto|anotame un gasto|registra un gasto|agrega un gasto|pague|compre|me gaste)\b/) && !/\bcuanto\b/.test(t)) {
    const monto = parseMonto(t);
    if (monto) {
      const categoria = detectarCategoria(t);
      const mNota = /\ben\s+(?:el\s+|la\s+|un\s+|una\s+)?([a-z ]+)$/.exec(t);
      let nota = mNota ? mNota[1].trim() : null;
      if (nota && /^(comida|transporte|ocio|hogar|salud|suscripciones|otros)$/.test(nota)) nota = null;
      return { tipo: 'agregar_gasto', monto, categoria, nota };
    }
  }
  // En qué gasté
  if (tiene(t, /\b(en que|que) (he )?gast(e|ado)\b/, /\bmis (ultimos )?gastos\b/, /\bultimos gastos\b/)) {
    return { tipo: 'ultimos_gastos', periodo: /\bsemana\b/.test(t) ? 'semana' : 'hoy' };
  }
  // Cuánto gasté (en una categoría o en total)
  if (tiene(t, /\bcuanto\b.*\b(gaste|gastado|llevo|he gastado|gastamos|se me ha ido)\b/, /\b(gastos|gasto) (de|del|esta|este)\b/)) {
    const cat = detectarCategoria(t);
    if (cat !== 'otros' && /\ben\b/.test(t)) return { tipo: 'gasto_categoria', categoria: cat, periodo: /\bsemana\b/.test(t) ? 'semana' : 'mes' };
    if (/\bmes\b/.test(t)) return { tipo: 'gasto_periodo', periodo: 'mes' };
    if (/\bhoy\b/.test(t)) return { tipo: 'gasto_periodo', periodo: 'hoy' };
    return { tipo: 'gasto_periodo', periodo: 'semana' };
  }
  if (tiene(t, /\bpresupuesto\b/, /\bcuanto me queda\b/)) return { tipo: 'presupuesto' };
  if (tiene(t, /\b(como van|como va|cuanto llevo en) (mis |mi )?metas?\b/, /\bmis metas\b/)) return { tipo: 'metas' };
  return null;
}

function reglaGym(t: string): Intencion | null {
  // Consultas de peso (antes que registrar)
  if (tiene(t, /\bcuanto (peso|pese|levante|hice)\b/, /\bultim[oa] (peso|vez).*(marque|levante|pese)\b/, /\bpeso marque\b/)) {
    return { tipo: 'ultimo_peso', texto: t };
  }
  const s = digitos(t);
  // Registrar series: "3 series de 10 de press banca con 40 kilos", "hice 4x12 de sentadilla con 60"
  if (/\b(series?|\d+\s*x\s*\d+|reps|repeticiones)\b/.test(s) && /\d/.test(s)) {
    const mx = /\b(\d+)\s*x\s*(\d+)\b/.exec(s);
    const series = Number(mx?.[1] ?? /\b(\d+)\s*series?\b/.exec(s)?.[1] ?? 1);
    const reps = Number(
      mx?.[2] ?? /\bseries?\s+de\s+(\d+)\b/.exec(s)?.[1] ?? /\b(\d+)\s*(?:repeticiones|reps)\b/.exec(s)?.[1] ?? NaN,
    );
    const pesoTxt = /\b(?:con|a)\s+(\d+(?:\.\d+)?)\s*(?:kilos?|kg)?\b/.exec(s)?.[1] ?? /\b(\d+(?:\.\d+)?)\s*(?:kilos?|kg)\b/.exec(s)?.[1];
    const ejercicio = s
      .replace(/\b(anota(me)?|registra(me)?|agrega|hice|haz|termine|ya)\b/g, ' ')
      .replace(/\b\d+\s*x\s*\d+\b/g, ' ')
      .replace(/\b\d+\s*series?\b/g, ' ')
      .replace(/\b\d+\s*(repeticiones|reps)\b/g, ' ')
      .replace(/\b(de|con|a)\s+\d+(\.\d+)?\s*(kilos?|kg)?\b/g, ' ')
      .replace(/\b\d+(\.\d+)?\s*(kilos?|kg)\b/g, ' ')
      .replace(/\b(series?|repeticiones|reps|kilos?|kg|en|el|la|los|las|un|una|de|del|con)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (Number.isFinite(reps) && ejercicio.length > 1) {
      return { tipo: 'registrar_serie', ejercicio, series: Math.min(10, Math.max(1, series)), reps, peso: Number(pesoTxt ?? 0) };
    }
  }
  // Registrar peso corporal: "anota mi peso 78,5", "hoy peso 78 kilos", "me pesé y marqué 77"
  if (tiene(s, /\b(anota|registra|guarda)\b.*\bpeso\b/, /\bmi peso (es|de|hoy)\b/, /^(hoy )?peso \d/, /\bme pese\b/, /\bestoy pesando\b/)) {
    const kg = Number(/(\d{2,3}(?:\.\d+)?)/.exec(s)?.[1]);
    if (kg >= 25 && kg <= 300) return { tipo: 'registrar_peso', kg };
  }
  if (tiene(t, /\b(gym|gimnasio|entreno|entrenamiento|rutina)\b/)) return { tipo: 'gym_hoy' };
  return null;
}

function reglaHabitosNotas(t: string): Intencion | null {
  const mCrearHab = /^(?:crea(?:me)?|crear|agrega|agregar|nuevo|quiero (?:empezar|comenzar|partir)(?: con)?)\s+(?:un\s+)?(?:nuevo\s+)?habito\s+(?:de\s+|para\s+|que\s+)?(.+)$/.exec(t);
  if (mCrearHab) return { tipo: 'crear_habito', nombre: mCrearHab[1] };
  if (tiene(t, /\bracha\b/, /\bdias seguidos\b/)) return { tipo: 'racha', texto: t };
  if (/^(?:marca(?:r)?\s+(?:el\s+)?habito\s+(?:de\s+)?|ya\s+(?:tome|lei|medite|camine|estire|dormi))/.test(t)) {
    return { tipo: 'marcar_habito', texto: t.replace(/^marca(r)?\s+(el\s+)?habito\s+(de\s+)?/, '') };
  }
  const mNota =
    /^(?:anota|anotame|toma|guarda|crea|escribe|agrega)\s+(?:una\s+)?nota\s*(?:que|de|:)?\s+(.+)$/.exec(t) ??
    /^toma nota\s+(?:de\s+|que\s+)?(.+)$/.exec(t);
  if (mNota) return { tipo: 'crear_nota', texto: mNota[1] };
  if (tiene(t, /\b(lee|leeme|muestrame|cuales son|que)\b.*\bnotas\b/, /^mis notas$/)) return { tipo: 'leer_notas' };
  return null;
}

function reglaClima(t: string, hoy: Date): Intencion | null {
  const esClima =
    tiene(t, /\b(clima|lluvia|llover|llueve|lloviendo|paraguas|temperatura|grados|pronostico)\b/, /\bhace (frio|calor)\b/, /\bque tiempo\b/, /\bcomo (esta|va a estar) el tiempo\b/, /\b(va a|hara) (frio|calor|sol)\b/);
  if (!esClima) return null;
  const foco = /\b(lluvia|llover|llueve|lloviendo|paraguas)\b/.test(t) ? 'lluvia' : /\b(temperatura|grados|frio|calor)\b/.test(t) ? 'temperatura' : null;
  if (/\b(semana|proximos dias|estos dias)\b/.test(t)) return { tipo: 'clima', cuando: 'semana', fecha: null, foco };
  const f = detectarFecha(t, hoy);
  if (f.encontrada && f.fecha && f.fecha !== toISODate(hoy)) return { tipo: 'clima', cuando: 'fecha', fecha: f.fecha, foco };
  return { tipo: 'clima', cuando: /\bhoy\b/.test(t) || foco === 'lluvia' ? 'hoy' : 'ahora', fecha: null, foco };
}

function reglaAbrir(t: string): Intencion | null {
  const m = /^(?:abre|abrir|abreme|ir a|vamos a|llevame a|muestrame|ve a|anda a|entra a)\s+(?:la\s+|el\s+|los\s+|las\s+|mis\s+|mi\s+|pantalla de\s+)?(.+)$/.exec(t);
  if (!m) return null;
  return { tipo: 'abrir', destino: m[1].trim() };
}

const COLORES_HUD: Record<string, ColorHud> = {
  cian: 'cian', celeste: 'cian', turquesa: 'cian', rojo: 'rojo', azul: 'azul', verde: 'verde', lima: 'lima',
  morado: 'morado', violeta: 'morado', lila: 'morado', naranjo: 'naranjo', naranja: 'naranjo', dorado: 'dorado',
  amarillo: 'dorado', oro: 'dorado', blanco: 'blanco', rosado: 'rosado', rosa: 'rosado',
};

function reglaHud(t: string): Intencion | null {
  if (/^(eso es todo|eso seria todo|eso seria|nada mas|chao|adios|hasta luego|descansa|puedes descansar|listo gracias|termina|terminar|apagate)\b/.test(t)) {
    return { tipo: 'fin_conversacion' };
  }
  if (/\b(colores normales|vuelve a lo normal|interfaz normal|reinicia la interfaz|color original|restablece (la interfaz|los colores))\b/.test(t)) {
    return { tipo: 'tema_hud', color: 'defecto' };
  }
  const mColor =
    /\b(?:ponte|pon(?:te)? el reactor|cambia(?:te)?(?: el)?(?: color)?(?: a)?|color|modo|tema)\s+(?:en\s+|a\s+|de\s+)?(cian|celeste|turquesa|rojo|azul|verde|lima|morado|violeta|lila|naranjo|naranja|dorado|amarillo|oro|blanco|rosado|rosa)\b/.exec(t);
  if (mColor) return { tipo: 'tema_hud', color: COLORES_HUD[mColor[1]] };
  if (/\b(modo escaner|escanea|escaneo|haz un escaneo|escanear)\b/.test(t)) return { tipo: 'efecto_hud', efecto: 'scan' };
  if (/\b(haz un pulso|lanza un pulso)\b/.test(t)) return { tipo: 'efecto_hud', efecto: 'pulse' };
  if (/\b(estado del sistema|diagnostico|reporte de estado|estado general|informe de estado|como estas|como andas|status)\b/.test(t)) {
    return { tipo: 'estado_sistema' };
  }
  return null;
}

// ---------- Interpretación principal ----------

export function interpretar(frase: string, hoy = new Date(), contexto: Contexto = {}): Intencion {
  const t = sinActivacion(frase);
  if (!t) return { tipo: 'saludo' };

  // Preguntas de seguimiento cortas: "¿y mañana?", "¿y el viernes?", "¿y la semana?"
  const seguimiento = /^(y|y para|y el|y la|y pa)\s+(.+)$/.exec(t);
  if (seguimiento && contexto.ultimo && seguimiento[2].split(' ').length <= 3) {
    const resto = seguimiento[2];
    const f = detectarFecha(resto, hoy);
    if (contexto.ultimo === 'clima') {
      if (/semana/.test(resto)) return { tipo: 'clima', cuando: 'semana', fecha: null, foco: null };
      if (f.encontrada) return { tipo: 'clima', cuando: f.fecha === toISODate(hoy) ? 'hoy' : 'fecha', fecha: f.fecha, foco: null };
    }
    if (/^tareas_/.test(contexto.ultimo)) {
      if (/semana/.test(resto)) return { tipo: 'tareas_semana' };
      if (f.encontrada && f.fecha) return f.fecha === toISODate(hoy) ? { tipo: 'tareas_hoy' } : { tipo: 'tareas_dia', fecha: f.fecha };
    }
    if (contexto.ultimo === 'gasto_periodo' || contexto.ultimo === 'gasto_categoria') {
      if (/mes/.test(resto)) return { tipo: 'gasto_periodo', periodo: 'mes' };
      if (/semana/.test(resto)) return { tipo: 'gasto_periodo', periodo: 'semana' };
      if (/hoy/.test(resto)) return { tipo: 'gasto_periodo', periodo: 'hoy' };
    }
  }

  const porRegla =
    reglasFinanzas(t) ??
    reglasEstudio(t, hoy, detectarFecha) ??
    reglasExtra(t) ??
    reglasApps(t) ??
    reglaHud(t) ??
    reglaRecordatorio(t, hoy) ??
    reglaAbrir(t) ??
    reglaTareas(t, hoy) ??
    reglaPlata(t) ??
    reglaGym(t) ??
    reglaHabitosNotas(t) ??
    reglaClima(t, hoy);
  if (porRegla) return porRegla;

  // Tareas (consultas)
  if (tiene(t, /\btareas?\b/, /\bque (tengo|me falta|me queda|hay) (que hacer|pendiente)/, /\bpendientes?\b/, /^que tengo (manana|el|para|pasado)/)) {
    if (/\bsemana\b/.test(t)) return { tipo: 'tareas_semana' };
    const f = detectarFecha(t, hoy);
    if (f.encontrada && f.fecha && f.fecha !== toISODate(hoy)) return { tipo: 'tareas_dia', fecha: f.fecha };
    return { tipo: 'tareas_hoy' };
  }
  if (/^y (esta |la )?semana$/.test(t)) return { tipo: 'tareas_semana' };

  // Generales
  if (tiene(t, /\bque hora es\b/, /\bme dices la hora\b/)) return { tipo: 'fecha_hora', que: 'hora' };
  if (tiene(t, /\b(que dia es hoy|que fecha es|a cuanto estamos|que dia es)\b/)) return { tipo: 'fecha_hora', que: 'fecha' };
  if (tiene(t, /\b(resumen|como voy|como va mi dia|como estoy hoy|que hay para hoy|ponme al dia)\b/)) return { tipo: 'resumen' };
  if (tiene(t, /\b(motivame|animame|dame (animo|fuerza|una frase))\b/, /\bestoy (cansado|cansada|bajoneado|bajoneada|sin ganas|chato|chata)\b/)) {
    return { tipo: 'motivacion' };
  }
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
  '¿Va a llover mañana?',
  'Hice 3 series de 10 de press banca con 40 kilos',
  'Recuérdame en 20 minutos sacar la ropa',
  '¿Cómo voy hoy?',
  'Abona 10 lucas a mi meta',
  '¿Cómo me fue este mes?',
  '¿Cómo hago un respaldo?',
];
