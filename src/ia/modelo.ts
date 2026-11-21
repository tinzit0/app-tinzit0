/**
 * Cerebro de IA DENTRO del celular (gratis, sin internet, sin cuentas).
 *
 * - Usa React Native ExecuTorch con el modelo Qwen 3 (1.700 millones de
 *   parámetros, comprimido). Se descarga UNA vez (~1,3 GB) desde Ajustes.
 * - Solo se usa cuando las reglas no entendieron tu frase: así lo común sigue
 *   siendo instantáneo y la IA se encarga de "todo lo demás".
 * - La IA no toca tus datos directamente: llama a la herramienta
 *   "ejecutar_comando", que pasa por el MISMO intérprete de siempre. Así nunca
 *   hace algo que la app no sepa hacer, y todo queda igual de ordenado.
 * - Si la librería no existe (Expo Go, web) todo esto queda apagado sin romper nada.
 */
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import type { Accion, Respuesta } from '@/voice/ejecutar';
import { EJEMPLOS } from '@/voice/interpretar';
import { construirResumen } from '@/voice/resumen';
import { leerLlamadas, sinPensamiento } from './parser';

type RNE = typeof import('react-native-executorch');
type Sesion = Awaited<ReturnType<RNE['createLLMChatSession']>>;
type Modelo = import('react-native-executorch').LLMModel;

let lib: RNE | null | undefined;
function cargarLib(): RNE | null {
  if (lib !== undefined) return lib;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return (lib = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = require('react-native-executorch') as RNE;
    lib.setTelemetryEnabled?.(false); // privacidad: sin estadísticas de uso
  } catch {
    lib = null;
  }
  return lib;
}

/** ¿Esta instalación puede usar IA? (false en Expo Go o web) */
export function iaSoportada() {
  return cargarLib() !== null;
}

export const TAM_DESCARGA = '~1,3 GB';

function modeloBase(): Modelo | null {
  const l = cargarLib();
  return l ? l.models.llm.QWEN3_1_7B.XNNPACK_8DA4W : null;
}

// ---------- Estado guardado ----------

/** Rutas locales del modelo ya descargado (o null). */
async function modeloLocal(db: SQLiteDatabase): Promise<Modelo | null> {
  const raw = await getSetting(db, 'ia_modelo');
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Modelo;
    // Verificamos que el archivo siga existiendo
    if (m.modelPath && new File(m.modelPath).exists) return m;
  } catch {
    // dato dañado: lo tratamos como no descargado
  }
  return null;
}

export async function iaDescargada(db: SQLiteDatabase) {
  return (await modeloLocal(db)) !== null;
}

export async function iaActivada(db: SQLiteDatabase) {
  return iaSoportada() && (await getSetting(db, 'ia_activa')) !== '0' && (await iaDescargada(db));
}

export async function cambiarIaActiva(db: SQLiteDatabase, v: boolean) {
  await setSetting(db, 'ia_activa', v ? '1' : '0');
}

// ---------- Descargar / eliminar ----------

let descargaEnCurso: AbortController | null = null;

/** Descarga el modelo. onProgreso recibe 0..1. Se puede retomar si se corta. */
export async function descargarIA(db: SQLiteDatabase, onProgreso: (p: number) => void) {
  const l = cargarLib();
  const base = modeloBase();
  if (!l || !base) throw new Error('La IA no está disponible en esta versión de la app.');
  descargaEnCurso = new AbortController();
  try {
    const local = await l.download(base, {
      signal: descargaEnCurso.signal,
      onProgress: (p) => onProgreso(p > 1 ? p / 100 : p),
    });
    await setSetting(db, 'ia_modelo', JSON.stringify(local));
    await setSetting(db, 'ia_activa', '1');
    onProgreso(1);
  } finally {
    descargaEnCurso = null;
  }
}

export function cancelarDescarga() {
  descargaEnCurso?.abort();
}

/** Libera memoria y borra los archivos del modelo del celular. */
export async function eliminarIA(db: SQLiteDatabase) {
  liberarIA();
  const m = await modeloLocal(db);
  if (m) {
    for (const ruta of [m.modelPath, m.tokenizerPath, m.tokenizerConfigPath]) {
      try {
        const f = new File(ruta);
        if (f.exists) f.delete();
      } catch {
        // si no se puede borrar un archivo, seguimos con los demás
      }
    }
  }
  await setSetting(db, 'ia_modelo', '');
}

// ---------- Conversar ----------

let sesion: Sesion | null = null;
let cargando: Promise<Sesion> | null = null;
// La sesión se reutiliza (cargar el modelo tarda unos segundos), pero se
// renueva cada 3 preguntas o cuando cambió algún dato, para que la IA vea datos frescos
// y la conversación no crezca más de lo que el modelo aguanta.
let turnos = 0;
let datosCambiaron = false;

/** Libera la memoria del modelo (se llama al salir del asistente). */
export function liberarIA() {
  try {
    sesion?.stop();
    sesion?.dispose();
  } catch {
    // ya estaba liberado
  }
  sesion = null;
  cargando = null;
  turnos = 0;
  datosCambiaron = false;
}

const SISTEMA = (resumen: string, trato: string, estilo: string) => `Eres Tinzit0, el asistente personal de la app Tinzit0 (tareas, gastos en pesos chilenos, gastos fijos, metas de ahorro, gym, peso, hábitos, notas, clima, medallas, estadísticas y modo estudiante: ramos, notas 1,0 a 7,0, horario, asistencia, pruebas, pomodoro y tarjetas). Hablas español${estilo === 'jarvis' ? `, con tono de mayordomo elegante y sereno; llamas al usuario "${trato}"` : ' chileno informal y cercano'}.

Reglas:
- Responde en 1 o 2 frases cortas, sin listas, sin emojis, sin markdown. Tus respuestas se leen en voz alta.
- Si el usuario quiere HACER algo o pide un dato concreto de la app, llama a la herramienta "ejecutar_comando" con una frase simple en español, como estos ejemplos: ${EJEMPLOS.map((e) => `"${e}"`).join(', ')}, "anota un gasto de 3000 en transporte", "agrega una tarea comprar leche mañana", "el lunes toca piernas", "crea un hábito de meditar", "cómo hago un respaldo", "pon música para entrenar en spotify", "pausa la música", "siguiente canción", "qué canción está sonando", "busca recetas de pan en youtube", "llévame a la plaza de armas", "manda un whatsapp que diga voy en camino", "abre instagram", "pon un temporizador de 90 segundos", "recuérdame en 20 minutos tomar agua", "cómo voy en cálculo", "cuánto necesito en el examen de física", "me saqué un 5,5 en la prueba 1 de cálculo", "qué clase tengo ahora", "qué clases tengo mañana", "falté a física", "tengo prueba de química el viernes", "cuándo es mi próxima prueba", "modo enfoque de cálculo", "cuánto estudié esta semana", "resumen de la semana", "repasar tarjetas", "cuánto puedo gastar hoy", "cómo voy a terminar el mes", "escanea una boleta", "revisa los gastos del banco".
- Las notas de la universidad van de 1,0 a 7,0 y se aprueba con 4,0.
- También puedes usar las apps del celular (Spotify, YouTube, Maps, WhatsApp, Google y otras) con esa misma herramienta.
- Si el usuario pide varias cosas, llama a la herramienta una vez por cada una.
- Para preguntas o consejos, usa los DATOS de abajo. No inventes datos que no estén ahí.
- "5 lucas" = 5000 pesos.

DATOS DEL USUARIO:
${resumen}`;

// La herramienta escribe en el objeto de la pregunta ACTUAL (la sesión se reutiliza entre preguntas).
let actual: { ultima: Respuesta | null; acciones: Accion[]; ejecutar: (c: string) => Promise<Respuesta> } | null = null;

async function obtenerSesion(db: SQLiteDatabase): Promise<Sesion> {
  if (sesion) return sesion;
  if (cargando) return cargando;
  const l = cargarLib();
  const m = await modeloLocal(db);
  if (!l || !m) throw new Error('ia-no-lista');
  cargando = (async () => {
    const [resumen, trato, estilo] = await Promise.all([construirResumen(db), getSetting(db, 'asistente_trato'), getSetting(db, 'asistente_estilo')]);
    const s = await l.createLLMChatSession(m, {
      initialMessages: [{ role: 'system', content: SISTEMA(resumen, trato?.trim() || 'señor', estilo ?? 'jarvis') }],
      generationConfig: { temperature: 0.3, maxNewTokens: 220, enableThinking: false },
      toolOpts: {
        tools: [
          {
            type: 'function',
            function: {
              name: 'ejecutar_comando',
              description: 'Ejecuta una acción o consulta en la app Tinzit0 y devuelve el resultado. El comando es una frase simple en español.',
              parameters: {
                type: 'object',
                properties: { comando: { type: 'string', description: 'Frase en español, por ejemplo "anota un gasto de 5000 en comida"' } },
                required: ['comando'],
              },
            },
            execute: async (args: Record<string, unknown>) => {
              const comando = typeof args.comando === 'string' ? args.comando : '';
              if (!comando.trim()) return 'Error: falta el comando.';
              if (!actual) return 'Error: sin contexto.';
              const r = await actual.ejecutar(comando);
              actual.ultima = r;
              datosCambiaron = true;
              if (r.accion) actual.acciones.push(r.accion);
              return r.intencion === 'desconocido' ? 'La app no reconoce ese comando. Responde al usuario con lo que sepas o pídele que lo diga de otra forma.' : r.texto;
            },
          },
        ],
        parseToolCalls: leerLlamadas,
        maxToolTurns: 3,
      },
    });
    sesion = s;
    return s;
  })();
  try {
    return await cargando;
  } finally {
    cargando = null;
  }
}

/**
 * Usa la IA para una tarea de texto suelta (resumir una clase, crear tarjetas).
 * Abre una sesión aparte, sin herramientas, y la cierra al terminar para liberar memoria.
 * Lanza error si la IA no está descargada: quien llama usa el método sin IA.
 */
export async function generarTexto(db: SQLiteDatabase, instruccion: string, texto: string, onToken?: (t: string) => void): Promise<string> {
  const l = cargarLib();
  const m = await modeloLocal(db);
  if (!l || !m || (await getSetting(db, 'ia_activa')) === '0') throw new Error('ia-no-lista');
  liberarIA(); // el modelo no cabe dos veces en memoria
  const s = await l.createLLMChatSession(m, {
    initialMessages: [{ role: 'system', content: `Eres un asistente de estudio. Respondes en español, claro y breve, sin markdown. ${instruccion}` }],
    generationConfig: { temperature: 0.2, maxNewTokens: 600, enableThinking: false },
  });
  const corte = setTimeout(() => s.stop(), 90_000);
  try {
    // El modelo es chico: le pasamos como máximo ~6.000 caracteres.
    const turno = await s.sendMessage(texto.slice(0, 6000), onToken);
    const ultimo = [...turno.messages].reverse().find((x) => x.role === 'assistant');
    const out = sinPensamiento(typeof ultimo?.content === 'string' ? ultimo.content : '').trim();
    if (!out) throw new Error('ia-sin-respuesta');
    return out;
  } finally {
    clearTimeout(corte);
    try {
      s.dispose();
    } catch {
      // ya liberada
    }
  }
}

/**
 * Pregunta a la IA. Devuelve una Respuesta como las del intérprete.
 * Lanza error si la IA no está lista: quien llama usa la respuesta normal.
 */
export async function preguntarIA(
  db: SQLiteDatabase,
  frase: string,
  ejecutarComando: (c: string) => Promise<Respuesta>,
  onToken?: (t: string) => void,
): Promise<Respuesta> {
  const herramienta = { ultima: null as Respuesta | null, acciones: [] as Accion[], ejecutar: ejecutarComando };
  actual = herramienta;
  if (sesion && (turnos >= 3 || datosCambiaron)) liberarIA();
  const s = await obtenerSesion(db);

  // Límite de tiempo: si tarda más de 40 s, cortamos.
  const corte = setTimeout(() => s.stop(), 40_000);
  try {
    const turno = await s.sendMessage(frase, onToken);
    turnos++;
    const ultimo = [...turno.messages].reverse().find((m) => m.role === 'assistant');
    const contenido = typeof ultimo?.content === 'string' ? ultimo.content : '';
    let texto = sinPensamiento(contenido).replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '').trim();
    if (!texto && herramienta.ultima) texto = herramienta.ultima.texto;
    if (!texto) throw new Error('ia-sin-respuesta');
    return {
      texto,
      intencion: herramienta.ultima?.intencion ?? 'ia',
      panel: herramienta.ultima?.panel,
      ruta: herramienta.ultima?.ruta,
      accion: herramienta.acciones[0],
      hud: herramienta.ultima?.hud,
    } as Respuesta;
  } finally {
    clearTimeout(corte);
    actual = null;
  }
}
