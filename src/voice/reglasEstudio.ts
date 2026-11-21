/**
 * Órdenes del Modo Estudiante:
 *   "¿cómo voy en cálculo?", "¿cuánto necesito en el examen de física?",
 *   "me saqué un 5,5 en la prueba 1 de cálculo", "¿qué clase tengo ahora?",
 *   "¿qué clases tengo mañana?", "falté a física", "¿cuántas faltas llevo?",
 *   "tengo prueba de química el viernes", "¿cuándo es mi próxima prueba?",
 *   "modo enfoque de cálculo", "¿cuánto estudié esta semana?",
 *   "resumen de la semana", "graba la clase", "escanea mis apuntes", "repasar tarjetas".
 * Funciones puras: se prueban en scripts/test-voz.ts.
 */
export type IntencionEstudio =
  | { tipo: 'nota_promedio'; ramo: string | null; desdeNotas?: boolean }
  | { tipo: 'nota_necesito'; ramo: string | null }
  | { tipo: 'nota_agregar'; ramo: string; nota: number; evaluacion: string | null }
  | { tipo: 'clase_ahora' }
  | { tipo: 'clases_dia'; fecha: string }
  | { tipo: 'asistencia'; ramo: string; presente: boolean }
  | { tipo: 'asistencia_consulta'; ramo: string | null }
  | { tipo: 'prueba_agregar'; ramo: string; fecha: string | null; nombre: string }
  | { tipo: 'pruebas_proximas'; ramo: string | null }
  | { tipo: 'pomodoro'; ramo: string | null }
  | { tipo: 'estudio_semana' }
  | { tipo: 'resumen_semana' }
  | { tipo: 'tarjetas_pendientes' }
  | { tipo: 'estudio_ir'; ruta: string; nombre: string };

type DetectorFecha = (t: string, hoy: Date) => { fecha: string | null; resto: string; encontrada: boolean };

const NUM_NOTA: Record<string, number> = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, cero: 0, ocho: 8, nueve: 9 };
const EVAL = '(?:prueba|control|certamen|examen|quiz|test|solemne|disertacion|entrega|trabajo|informe|evaluacion|tarea|laboratorio|lab)';
/** Cosas que NO son ramos (para no confundir "fui al gym" con asistencia). */
const NO_RAMO = /^(el |la |los |las |mi |mis )?(gym|gimnasio|entreno|super|supermercado|banco|doctor|medico|dentista|trabajo|pega|casa|mall|feria|almuerzo|almorzar|comer|plata|gastos?|presupuesto|habitos?|tareas?|ahorro|metas?|semana|mes|hoy|peso|asistencia|spotify|musica)\b/;

const limpiar = (s: string) =>
  s
    .replace(/\s+(por favor|porfa)$/, '')
    .replace(/^(el|la|los|las|mi|mis|ramo de|ramo|curso de|curso|clase de|clases de|la clase de)\s+/, '')
    .replace(/\s+(hoy|ahora|este semestre|en el semestre)$/, '')
    .replace(/\s+/g, ' ')
    .trim();

function leerNumeroNota(entero: string, decimal?: string): number | null {
  const e = /^\d+(\.\d)?$/.test(entero) ? Number(entero) : NUM_NOTA[entero];
  if (e == null || !Number.isFinite(e)) return null;
  let n = e;
  if (decimal != null) {
    const d = /^\d$/.test(decimal) ? Number(decimal) : NUM_NOTA[decimal];
    if (d == null) return null;
    n = Math.trunc(e) + d / 10;
  }
  if (n >= 10 && n <= 70 && Number.isInteger(n)) n = n / 10; // "un 55" → 5,5
  return n >= 1 && n <= 7 ? Math.round(n * 10) / 10 : null;
}

export function reglasEstudio(t: string, hoy: Date, detectarFecha: DetectorFecha): IntencionEstudio | null {
  if (/^(como (hago|puedo|se|activo|uso|funciona|agrego|creo|configuro|pongo|marco|registro)|para que sirve|que es (el|la|un|una))\b/.test(t)) return null;
  // --- Ir a pantallas del estudio ---
  if (/\b(graba(r)?|grabame|transcribe|transcribir|transcribeme)\s+(la |esta |mi |una )?clase\b/.test(t)) return { tipo: 'estudio_ir', ruta: '/grabar', nombre: 'la grabadora de clases' };
  if (/\b(escanea(r)?|escaneame|digitaliza(r)?|sacale (una )?foto a|lee(r)?|leeme)\s+(mis |los |el |la |este |estos |esta |unos )?(apuntes?|cuaderno|pizarra|pizarron|hoja|guia|documento|materia)\b/.test(t)) {
    return { tipo: 'estudio_ir', ruta: '/escanear', nombre: 'el escáner de apuntes' };
  }
  if (/\b(cuantas tarjetas|tarjetas (pendientes|para hoy|por repasar|que me quedan))\b/.test(t)) return { tipo: 'tarjetas_pendientes' };
  if (/\b(repasar|repasemos|repaso|repasa)\b.*\b(tarjetas|flashcards|materia)\b|^(quiero repasar|vamos a repasar|repasemos|modo repaso)$/.test(t)) return { tipo: 'estudio_ir', ruta: '/repaso', nombre: 'el repaso de tarjetas' };
  if (/^(abre |ir a |muestrame |ver |abrir )?(mis |las )?(tarjetas|flashcards|tarjetas de memoria)$/.test(t)) return { tipo: 'estudio_ir', ruta: '/tarjetas', nombre: 'tus tarjetas' };
  if (/^(abre |ir a |muestrame |ver |abrir |llevame a )?(mis ramos|mis cursos|el modo estudiante|modo estudiante|estudio|la u|universidad|mis estudios|la seccion de estudio)$/.test(t)) return { tipo: 'estudio_ir', ruta: '/estudio', nombre: 'Estudio' };

  // --- Resumen y horas de estudio ---
  if (/\b(resumen (de la|semanal|de mi|de esta) semana|como me fue (esta|la) semana|como me va esta semana|balance de la semana|resumen semanal|como estuvo mi semana)\b/.test(t)) return { tipo: 'resumen_semana' };
  if (/\b(cuanto (he )?estudie|cuanto he estudiado|cuantas horas (he )?estudi\w*|horas de estudio|tiempo de estudio|cuanto llevo estudiando)\b/.test(t)) return { tipo: 'estudio_semana' };

  // --- Pomodoro / modo enfoque ---
  const pomo = /\b(pomodoro|modo (?:enfoque|concentracion|estudio)|temporizador de estudio|quiero estudiar|vamos a estudiar|a estudiar|ponte a estudiar|empecemos a estudiar|ayudame a estudiar|sesion de estudio|me voy a concentrar)\b(.*)$/.exec(t);
  if (pomo && !/\b(cuanto|cuantas)\b/.test(t)) {
    const r = /(?:de|para|en)\s+(.+)$/.exec(pomo[2].trim());
    return { tipo: 'pomodoro', ramo: r ? limpiar(r[1]) || null : null };
  }

  // --- Agregar una nota: "me saqué un 5,5 en la prueba 1 de cálculo" ---
  const nota = /^(?:me saque|saque|me fue con|obtuve|me pusieron|tengo|me saque nota)\s+(?:un|una|el|nota)?\s*(\d+(?:\.\d)?|uno|dos|tres|cuatro|cinco|seis|siete)(?:\s+(?:coma|punto)\s+(\d|cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))?\s+(?:en|de)\s+(.+)$/.exec(t);
  if (nota) {
    const n = leerNumeroNota(nota[1], nota[2]);
    if (n != null) {
      const resto = nota[3].trim();
      const ev = new RegExp(`^(?:el |la |mi )?(${EVAL}(?:\\s+(?:\\d+|uno|dos|tres|final|parcial|recuperativ[oa]))?)\\s+(?:de|del|en)\\s+(.+)$`).exec(resto);
      const ramo = limpiar(ev ? ev[2] : resto);
      if (ramo && !NO_RAMO.test(ramo)) return { tipo: 'nota_agregar', ramo, nota: n, evaluacion: ev ? ev[1] : null };
    }
  }

  // --- Evaluaciones con fecha: "tengo prueba de química el viernes" ---
  const prueba = new RegExp(`^(?:tengo|hay|anota|agenda|agrega|tendre|voy a tener|me toca)\\s+(?:una?\\s+|el\\s+|la\\s+)?(${EVAL})(?:\\s+(\\d+|final|parcial))?\\s+(?:de|del|en)\\s+(.+)$`).exec(t);
  if (prueba) {
    const f = detectarFecha(prueba[3], hoy);
    const ramo = limpiar(f.resto.replace(/\s+(para|el|este)$/, ''));
    if (ramo && !NO_RAMO.test(ramo)) {
      const nombre = `${prueba[1].charAt(0).toUpperCase()}${prueba[1].slice(1)}${prueba[2] ? ` ${prueba[2]}` : ''}`;
      return { tipo: 'prueba_agregar', ramo, fecha: f.encontrada ? f.fecha : null, nombre };
    }
  }
  if (/\b(cuando es mi (proxima |siguiente )?(prueba|examen|control|certamen|evaluacion)|que (pruebas|evaluaciones|examenes|controles) tengo|mis (proximas )?(pruebas|evaluaciones)|proximas (pruebas|evaluaciones)|tengo (alguna )?(prueba|pruebas|examen|examenes|evaluaciones)( esta semana| pronto| la proxima semana)?$)\b/.test(t)) {
    const r = /(?:prueba|examen|control|certamen|evaluacion|pruebas)\s+(?:de|del|en)\s+(.+)$/.exec(t);
    return { tipo: 'pruebas_proximas', ramo: r ? limpiar(r[1]) || null : null };
  }

  // --- Asistencia ---
  const asisConsulta = /\b(cuantas (?:faltas|inasistencias|ausencias)(?: llevo| tengo)?|como voy (?:de|en|con la) asistencia|mi asistencia|cuanto he faltado|cuantas veces he faltado|como va mi asistencia)\b(.*)$/.exec(t);
  if (asisConsulta) {
    const r = /(?:en|a|de|al)\s+(.+)$/.exec(asisConsulta[2].trim());
    return { tipo: 'asistencia_consulta', ramo: r ? limpiar(r[1]) || null : null };
  }
  const falte = /^(?:falte|no fui|no asisti|me salte|no pude ir|me perdi)\s+(?:a|al|a la)\s+(?:clase de\s+|la clase de\s+)?(.+)$/.exec(t);
  if (falte && !NO_RAMO.test(falte[1])) return { tipo: 'asistencia', ramo: limpiar(falte[1]), presente: false };
  const fui = /^(?:fui|asisti|estuve|vine)\s+(?:a|al|a la|en)\s+(?:clase de\s+|la clase de\s+)(.+)$/.exec(t) ?? /^(?:asisti|marca (?:mi )?asistencia)\s+(?:a|al|a la|en)\s+(.+)$/.exec(t);
  if (fui && !NO_RAMO.test(fui[1])) return { tipo: 'asistencia', ramo: limpiar(fui[1]), presente: true };

  // --- Notas: promedio y "¿cuánto necesito?" ---
  const necesito = /\b(?:cuanto|que nota)\s+(?:necesito|me falta|tengo que sacar|debo sacar|necesitaria|me hace falta)\b(.*)$/.exec(t) ?? /^(?:voy a pasar|voy a aprobar|apruebo|paso)\s+(.+?)\??$/.exec(t);
  if (necesito && !/\b(plata|lucas|pesos|ahorr|meta)\b/.test(t)) {
    const resto = necesito[1]
      .replace(/\b(para (pasar|aprobar|salvar|el (cuatro|4)|eximirme)|en (el|la) (examen|prueba|ultima prueba|final)( final)?|en lo que (me )?queda|lo que (me )?queda|el ramo)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const r = /(?:^|\s)(?:de|en|del|a)\s+(.+)$/.exec(resto);
    const ramo = limpiar(r ? r[1] : resto);
    return { tipo: 'nota_necesito', ramo: ramo || null };
  }
  const promedio = /\bpromedio\b(?:\s+(?:general|final|ponderado))?(?:\s+(?:de|en|del)\s+(.+))?$/.exec(t);
  if (promedio && !/\b(gasto|gaste|plata|lucas)\b/.test(t)) return { tipo: 'nota_promedio', ramo: promedio[1] ? limpiar(promedio[1]) || null : null };
  const comoVoy = /^(?:como voy|como me va|como ando|como estoy|como vamos)\s+en\s+(.+)$/.exec(t);
  if (comoVoy && !NO_RAMO.test(comoVoy[1])) return { tipo: 'nota_promedio', ramo: limpiar(comoVoy[1]) };
  const notasDe = /^(?:mis |que |cuales son mis |dime mis |muestrame mis )?notas (?:de|en|del) (.+)$/.exec(t);
  if (notasDe && !NO_RAMO.test(notasDe[1])) return { tipo: 'nota_promedio', ramo: limpiar(notasDe[1]), desdeNotas: true };

  // --- Horario ---
  const preguntaClase = /\b(clases?|horario)\b/.test(t) && /\b(que|cual|cuales|mi|mis|tengo|hay|me toca|a que hora|donde|sala)\b/.test(t);
  if (/\b(que me toca ahora|siguiente clase|proxima clase|en que sala|donde es mi (proxima |siguiente )?clase|a que hora es mi (proxima )?clase)\b/.test(t)) return { tipo: 'clase_ahora' };
  if (preguntaClase) {
    const f = detectarFecha(t, hoy);
    if (f.encontrada && f.fecha) return { tipo: 'clases_dia', fecha: f.fecha };
    if (/\bclase\b/.test(t) && !/\bclases\b/.test(t)) return { tipo: 'clase_ahora' };
    if (/\b(que clases tengo|mis clases|mi horario|clases de hoy)\b/.test(t) && !/\b(abre|muestrame|ver)\b/.test(t)) return { tipo: 'clases_dia', fecha: f.fecha ?? '' };
  }
  if (/^(abre |ir a |muestrame |ver |abrir )?(mi |el )?horario( de clases)?$/.test(t)) return { tipo: 'estudio_ir', ruta: '/horario', nombre: 'tu horario' };

  return null;
}
