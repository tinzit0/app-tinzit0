/**
 * Más cosas que entiende Tinzit0, para cubrir TODA la app:
 * gastos fijos, estadísticas, medallas, récords del gym, rutina por día,
 * buscar notas, hábitos pendientes, tema claro/oscuro, temporizador,
 * preguntas de "¿cómo hago…?" y enseñarle frases nuevas.
 * Funciones puras (sin base de datos): se prueban en scripts/test-voz.ts.
 */
export type IntencionExtra =
  | { tipo: 'fijos'; que: 'total' | 'proximos' }
  | { tipo: 'estadisticas_mes' }
  | { tipo: 'logros' }
  | { tipo: 'record_ejercicio'; texto: string }
  | { tipo: 'rutina_dia'; dia: number }
  | { tipo: 'cambiar_rutina'; dia: number; label: string | null }
  | { tipo: 'buscar_notas'; texto: string }
  | { tipo: 'habitos_pendientes' }
  | { tipo: 'ayuda_app'; tema: string }
  | { tipo: 'cambiar_tema'; tema: 'claro' | 'oscuro' | 'sistema' }
  | { tipo: 'temporizador'; segundos: number }
  | { tipo: 'ensenar'; frase: string; comando: string }
  | { tipo: 'olvidar'; frase: string };

const DIAS: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
const NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, noventa: 90, cien: 100 };

const tiene = (t: string, ...res: RegExp[]) => res.some((r) => r.test(t));

/** Temas de ayuda: palabras clave → id del tema (las respuestas están en ejecutar). */
export const TEMAS_AYUDA: [RegExp, string][] = [
  [/respald|backup|copia de seguridad|cambio de celular|exportar|importar/, 'respaldo'],
  [/huella|bloqueo|bloquear|contrasena|pin/, 'bloqueo'],
  [/widget/, 'widget'],
  [/gastos? (del banco|automatic)|avisos del banco|notificaciones del banco|banco/, 'banco'],
  [/boleta|recibo|ticket/, 'boleta'],
  [/asistencia automatica|ubicacion de la u|geocerca/, 'campus'],
  [/cuanto puedo gastar|proyeccion|fin de mes/, 'proyeccion'],
  [/escane|foto (a|de) (mis )?apuntes|pizarra|ocr/, 'escanear'],
  [/grab(ar|o) (la |una )?clase|transcrib/, 'grabar'],
  [/tarjeta|flashcard|repas|memoriz/, 'tarjetas'],
  [/pomodoro|enfoque|concentr/, 'pomodoro'],
  [/horario|clases|sala/, 'horario'],
  [/asistencia|falta|inasistencia/, 'asistencia'],
  [/ramo|promedio|ponderac|nota (para|de la|del ramo)|cuanto necesito|modo estudiante|estudio|prueba|examen|certamen|evaluacion/, 'estudio'],
  [/notificacion|aviso|alarma|recordatorio de la manana|hora de los avisos/, 'notificaciones'],
  [/fijo|arriendo|suscripcion|cuenta mensual/, 'fijos'],
  [/meta|ahorr/, 'metas'],
  [/habito|racha/, 'habitos'],
  [/rutina|gym|ejercicio|serie|entren/, 'gym'],
  [/peso|medida|cintura/, 'cuerpo'],
  [/presupuesto/, 'presupuesto'],
  [/gasto|plata|categoria/, 'gastos'],
  [/tarea|repet/, 'tareas'],
  [/nota/, 'notas'],
  [/tema|modo oscuro|modo claro|color/, 'tema'],
  [/voz|jarvis|tinzit|microfono|asistente|hablar|escuchar/, 'asistente'],
  [/app|aplicacion|whatsapp|spotify|acceso/, 'apps'],
  [/clima|ciudad|ubicacion|tiempo/, 'clima'],
  [/estadistica|numeros|grafico/, 'estadisticas'],
  [/medalla|logro|trofeo/, 'logros'],
];

function dia(t: string): number | null {
  const m = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.exec(t);
  return m ? DIAS[m[1]] : null;
}

export function reglasExtra(t: string): IntencionExtra | null {
  // --- Enseñar / olvidar frases ---
  const mEns =
    /^(?:cuando (?:te )?diga|si (?:te )?digo)\s+(.+?)\s*,?\s+(?:quiero que |tu )?(?:hagas|haz|significa|es|muestrame|dime|entiende)\s+(.+)$/.exec(t) ??
    /^(?:aprende|aprendete|recuerda)\s+que\s+(.+?)\s+(?:significa|es|quiere decir)\s+(.+)$/.exec(t);
  if (mEns) {
    const comando = mEns[2].replace(/^(que )?(lo mismo que |igual que )?/, '').trim();
    if (mEns[1].length >= 2 && comando.length >= 2) return { tipo: 'ensenar', frase: mEns[1].trim(), comando };
  }
  const mOlv = /^(?:olvida|olvidate de|borra lo que aprendiste de)\s+(?:la frase\s+)?(.+)$/.exec(t);
  if (mOlv) return { tipo: 'olvidar', frase: mOlv[1].trim() };

  // --- Ayuda sobre la app: "¿cómo hago un respaldo?", "¿para qué sirve…?", "¿dónde veo…?" ---
  if (/^(como (hago|puedo|se|activo|desactivo|agrego|anoto|creo|cambio|configuro|uso|pongo|funciona|elimino|borro|veo|instalo|registro|marco)|para que sirve|donde (veo|esta|encuentro|cambio)|que es (el|la|un|una))\b/.test(t)) {
    const tema = TEMAS_AYUDA.find(([re]) => re.test(t))?.[1];
    if (tema) return { tipo: 'ayuda_app', tema };
  }

  // --- Tema de la app ---
  if (tiene(t, /\b(modo|tema) oscuro\b/, /\bponte oscuro\b/)) return { tipo: 'cambiar_tema', tema: 'oscuro' };
  if (tiene(t, /\b(modo|tema) claro\b/)) return { tipo: 'cambiar_tema', tema: 'claro' };
  if (tiene(t, /\b(tema|modo) (del )?sistema\b/, /\btema automatico\b/)) return { tipo: 'cambiar_tema', tema: 'sistema' };

  // --- Temporizador ---
  const mTimer = /\b(?:temporizador|timer|descanso|cuenta regresiva|cronometro)\s+de\s+(\d+|[a-z]+)\s*(segundos?|minutos?|seg|min)\b/.exec(t)
    ?? /\b(?:pon(?:me)?|inicia|activa)\s+(?:un\s+)?(?:temporizador|timer|descanso)\s+(?:de\s+)?(\d+|[a-z]+)\s*(segundos?|minutos?|seg|min)\b/.exec(t);
  if (mTimer) {
    const n = /^\d+$/.test(mTimer[1]) ? Number(mTimer[1]) : NUM[mTimer[1]] ?? NaN;
    if (Number.isFinite(n) && n > 0) return { tipo: 'temporizador', segundos: /^min/.test(mTimer[2]) ? n * 60 : n };
  }

  // --- Gastos fijos ---
  if (tiene(t, /\b(gastos fijos|cuentas fijas|pagos fijos|mis fijos|cuanto pago (al|cada) mes)\b/, /\bque (cuentas|pagos) (tengo|vienen|me tocan)\b/, /\bproximos? pagos?\b/, /\bque tengo que pagar\b/)) {
    return { tipo: 'fijos', que: /\b(proxim|vienen|tocan|tengo que pagar|cuando)\b/.test(t) ? 'proximos' : 'total' };
  }

  // --- Estadísticas ---
  if (tiene(t, /\b(como me fue|como me va|como voy) (este|el) mes\b/, /\bestadisticas\b/, /\bresumen del mes\b/, /\bbalance del mes\b/, /\bmi mes en numeros\b/)) {
    return { tipo: 'estadisticas_mes' };
  }

  // --- Medallas ---
  if (tiene(t, /\b(medallas|logros|trofeos)\b/)) return { tipo: 'logros' };

  // --- Récord de un ejercicio ---
  const mRec = /\b(?:record|maximo|mejor marca|lo mas que he levantado|cuanto es lo mas)\b(?:\s+(?:en|de|del|para))?\s*(.*)$/.exec(t);
  if (mRec && !/\bracha\b/.test(t)) return { tipo: 'record_ejercicio', texto: mRec[1].trim() };

  // --- Rutina: cambiar o consultar un día ---
  const d = dia(t);
  if (d) {
    const mCambio = /\b(?:el|los)?\s*(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:toca|va a tocar|entreno|quiero entrenar|pon(?:me)?|sera(?: dia de)?)\s+(.+)$/.exec(t)
      ?? /\b(?:cambia|pon(?:me)?|deja)\s+(?:la rutina del?|el)\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:a|en|como|con)?\s*(.+)$/.exec(t);
    if (mCambio) {
      const label = mCambio[1].replace(/^(dia de |de )/, '').trim();
      return { tipo: 'cambiar_rutina', dia: d, label: /^(descanso|nada|libre)$/.test(label) ? null : label };
    }
    if (tiene(t, /\b(que me toca|que entreno|que toca|rutina)\b/) && !/\btarea/.test(t)) return { tipo: 'rutina_dia', dia: d };
  }

  // --- Buscar notas ---
  const mNotas = /\b(?:tengo (?:alguna )?nota|busca(?:me)? (?:en )?(?:mis )?notas?|nota)\s+(?:sobre|de|que diga|con)\s+(.+)$/.exec(t);
  if (mNotas) return { tipo: 'buscar_notas', texto: mNotas[1].trim() };

  // --- Hábitos pendientes ---
  if (tiene(t, /\bque habitos (me faltan|tengo pendientes|me quedan)\b/, /\bhabitos (pendientes|de hoy)\b/, /\bmis habitos\b/)) return { tipo: 'habitos_pendientes' };

  return null;
}
