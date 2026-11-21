/**
 * Modo IA del asistente: usa Claude (API de Anthropic) con TU propia API key.
 *
 * Cómo funciona:
 * 1. Armamos un resumen de tus datos (tareas, gastos, gym, hábitos, clima…).
 * 2. Claude lee tu mensaje + el resumen + la conversación de hoy.
 * 3. Si hay que HACER algo (anotar un gasto, crear una tarea, abrir una app…),
 *    Claude llama a una "herramienta". Cada herramienta usa exactamente la
 *    misma función que el modo sin internet (ejecutar.ts), así que el
 *    resultado es el mismo y queda guardado en tu celular.
 * 4. Claude responde corto y en chileno.
 *
 * Privacidad y costo:
 * - Cada mensaje envía ese resumen a Anthropic para que Claude pueda responder.
 * - Se cobra a tu cuenta de Anthropic por uso (cada mensaje cuesta una fracción de peso a unos pocos pesos).
 * - La API key se guarda cifrada en el celular (expo-secure-store), nunca en la
 *   base de datos ni en el respaldo.
 * - Si no hay internet o falla, el asistente usa el modo sin internet.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { SQLiteDatabase } from 'expo-sqlite';

import { CATEGORIAS } from '@/utils/categorias';
import { ejecutar, type Accion, type MensajeChat } from './ejecutar';
import type { Intencion } from './interpretar';
import { leerApiKey } from './iaConfig';
import { construirResumen } from './resumen';

const MODELO = 'claude-opus-5-5';

// ---------- Herramientas (cada una = una acción de ejecutar.ts) ----------

const CATS = CATEGORIAS.map((c) => c.key);

function crearHerramientas(db: SQLiteDatabase, acciones: Accion[]) {
  /** Ejecuta la intención con la MISMA lógica del modo sin internet y devuelve el resultado a Claude. */
  const hacer = async (i: Intencion) => {
    const r = await ejecutar(db, i);
    if (r.accion) acciones.push(r.accion);
    return r.texto;
  };
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const fechaOk = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const invalido = 'Error: datos inválidos para esta acción. Pide al usuario que lo repita.';

  return [
    betaTool({
      name: 'agregar_tarea',
      description: 'Crea una tarea. fecha en formato YYYY-MM-DD (null = sin fecha). semanal=true para "esta semana" sin día fijo.',
      strict: true,
      inputSchema: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          fecha: { type: ['string', 'null'] },
          prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          semanal: { type: 'boolean' },
        },
        required: ['titulo', 'fecha', 'prioridad', 'semanal'],
        additionalProperties: false,
      },
      run: async (a) =>
        texto(a.titulo)
          ? hacer({ tipo: 'agregar_tarea', titulo: texto(a.titulo), fecha: fechaOk(a.fecha), prioridad: a.prioridad, semanal: !!a.semanal })
          : invalido,
    }),
    betaTool({
      name: 'completar_tarea',
      description: 'Marca como hecha una tarea pendiente de hoy, buscándola por su nombre aproximado.',
      strict: true,
      inputSchema: { type: 'object', properties: { tarea: { type: 'string' } }, required: ['tarea'], additionalProperties: false },
      run: async (a) => hacer({ tipo: 'completar_tarea', texto: texto(a.tarea) }),
    }),
    betaTool({
      name: 'mover_tarea',
      description: 'Cambia la fecha de una tarea (por nombre aproximado) a la fecha YYYY-MM-DD.',
      strict: true,
      inputSchema: {
        type: 'object',
        properties: { tarea: { type: 'string' }, fecha: { type: 'string' } },
        required: ['tarea', 'fecha'],
        additionalProperties: false,
      },
      run: async (a) => (fechaOk(a.fecha) ? hacer({ tipo: 'mover_tarea', texto: texto(a.tarea), fecha: fechaOk(a.fecha)! }) : invalido),
    }),
    betaTool({
      name: 'eliminar_tarea',
      description: 'Borra una tarea, buscándola por su nombre aproximado. Úsala solo si el usuario pide borrarla.',
      strict: true,
      inputSchema: { type: 'object', properties: { tarea: { type: 'string' } }, required: ['tarea'], additionalProperties: false },
      run: async (a) => hacer({ tipo: 'eliminar_tarea', texto: texto(a.tarea) }),
    }),
    betaTool({
      name: 'agregar_gasto',
      description: 'Anota un gasto de hoy en pesos chilenos (entero, sin decimales). "5 lucas" = 5000.',
      strict: true,
      inputSchema: {
        type: 'object',
        properties: {
          monto: { type: 'integer' },
          categoria: { type: 'string', enum: CATS },
          nota: { type: ['string', 'null'] },
        },
        required: ['monto', 'categoria', 'nota'],
        additionalProperties: false,
      },
      run: async (a) =>
        numero(a.monto) > 0 ? hacer({ tipo: 'agregar_gasto', monto: Math.round(a.monto), categoria: a.categoria, nota: a.nota ? texto(a.nota) : null }) : invalido,
    }),
    betaTool({
      name: 'borrar_ultimo_gasto',
      description: 'Borra el último gasto anotado (por ejemplo si el usuario se equivocó).',
      strict: true,
      inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      run: async () => hacer({ tipo: 'borrar_ultimo_gasto' }),
    }),
    betaTool({
      name: 'cambiar_presupuesto',
      description: 'Cambia el presupuesto semanal (CLP, entero).',
      strict: true,
      inputSchema: { type: 'object', properties: { monto: { type: 'integer' } }, required: ['monto'], additionalProperties: false },
      run: async (a) => (numero(a.monto) > 0 ? hacer({ tipo: 'cambiar_presupuesto', monto: Math.round(a.monto) }) : invalido),
    }),
    betaTool({
      name: 'crear_meta',
      description: 'Crea una meta de ahorro con nombre y monto objetivo en CLP.',
      strict: true,
      inputSchema: {
        type: 'object',
        properties: { nombre: { type: 'string' }, monto: { type: 'integer' } },
        required: ['nombre', 'monto'],
        additionalProperties: false,
      },
      run: async (a) => (texto(a.nombre) && numero(a.monto) > 0 ? hacer({ tipo: 'crear_meta', nombre: texto(a.nombre), monto: Math.round(a.monto) }) : invalido),
    }),
    betaTool({
      name: 'abonar_meta',
      description: 'Abona dinero (CLP) a una meta de ahorro existente, buscándola por nombre aproximado.',
      strict: true,
      inputSchema: {
        type: 'object',
        properties: { meta: { type: 'string' }, monto: { type: 'integer' } },
        required: ['meta', 'monto'],
        additionalProperties: false,
      },
      run: async (a) => (numero(a.monto) > 0 ? hacer({ tipo: 'abonar_meta', monto: Math.round(a.monto), texto: texto(a.meta) }) : invalido),
    }),
    betaTool({
      name: 'registrar_serie',
      description: 'Registra series de un ejercicio del gym de hoy: cantidad de series, repeticiones por serie y peso en kg (0 si es peso corporal).',
      strict: true,
      inputSchema: {
        type: 'object',
        properties: { ejercicio: { type: 'string' }, series: { type: 'integer' }, reps: { type: 'integer' }, peso: { type: 'number' } },
        required: ['ejercicio', 'series', 'reps', 'peso'],
        additionalProperties: false,
      },
      run: async (a) =>
        texto(a.ejercicio) && numero(a.reps) > 0
          ? hacer({ tipo: 'registrar_serie', ejercicio: texto(a.ejercicio), series: Math.min(10, Math.max(1, Math.round(a.series))), reps: Math.round(a.reps), peso: Math.max(0, a.peso) })
          : invalido,
    }),
    betaTool({
      name: 'registrar_peso',
      description: 'Anota el peso corporal de hoy en kg.',
      strict: true,
      inputSchema: { type: 'object', properties: { kg: { type: 'number' } }, required: ['kg'], additionalProperties: false },
      run: async (a) => (numero(a.kg) >= 25 && a.kg <= 300 ? hacer({ tipo: 'registrar_peso', kg: Math.round(a.kg * 10) / 10 }) : invalido),
    }),
    betaTool({
      name: 'crear_habito',
      description: 'Crea un hábito diario nuevo.',
      strict: true,
      inputSchema: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'], additionalProperties: false },
      run: async (a) => (texto(a.nombre) ? hacer({ tipo: 'crear_habito', nombre: texto(a.nombre) }) : invalido),
    }),
    betaTool({
      name: 'marcar_habito',
      description: 'Marca como hecho hoy un hábito existente, buscándolo por nombre aproximado.',
      strict: true,
      inputSchema: { type: 'object', properties: { habito: { type: 'string' } }, required: ['habito'], additionalProperties: false },
      run: async (a) => hacer({ tipo: 'marcar_habito', texto: texto(a.habito) }),
    }),
    betaTool({
      name: 'crear_nota',
      description: 'Guarda una nota rápida con el texto indicado.',
      strict: true,
      inputSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'], additionalProperties: false },
      run: async (a) => (texto(a.texto) ? hacer({ tipo: 'crear_nota', texto: texto(a.texto) }) : invalido),
    }),
    betaTool({
      name: 'recordatorio',
      description: 'Programa una notificación para recordarle algo al usuario dentro de N minutos (1 a 10080).',
      strict: true,
      inputSchema: {
        type: 'object',
        properties: { texto: { type: 'string' }, minutos: { type: 'integer' } },
        required: ['texto', 'minutos'],
        additionalProperties: false,
      },
      run: async (a) =>
        texto(a.texto) && numero(a.minutos) >= 1 && a.minutos <= 10080
          ? hacer({ tipo: 'recordatorio', texto: texto(a.texto), segundos: Math.round(a.minutos) * 60, hora: null })
          : invalido,
    }),
    betaTool({
      name: 'abrir',
      description:
        'Abre una pantalla de Tinzit0 (hoy, tareas, gastos, gym, notas, hábitos, metas, fijos, clima, estadísticas, medallas, ajustes, rutina, peso) o una app del celular (WhatsApp, Spotify, Instagram, YouTube, Gmail, Maps, etc.).',
      strict: true,
      inputSchema: { type: 'object', properties: { destino: { type: 'string' } }, required: ['destino'], additionalProperties: false },
      run: async (a) => hacer({ tipo: 'abrir', destino: texto(a.destino) }),
    }),
  ];
}

const SISTEMA = `Eres Tinzit0, el asistente personal dentro de la app Tinzit0 del usuario (tareas, gastos en pesos chilenos, gym, hábitos, notas, metas de ahorro y clima).

Personalidad: cercano, motivador y con buena onda, en español chileno informal (puedes usar "bacán", "lucas", "dale", "al tiro"), sin exagerar los modismos.

Cómo responder:
- Tus respuestas se leen en voz alta: sé breve (1 a 3 frases), sin listas largas, sin markdown ni tablas.
- Para preguntas sobre sus datos, usa el bloque <datos> del mensaje. No inventes datos que no estén ahí; si algo no aparece, dilo.
- Para HACER algo (anotar, crear, marcar, mover, borrar, abrir, recordar) usa la herramienta correspondiente y después confirma en una frase lo que hiciste, según el resultado que te devuelva la herramienta. Si una herramienta responde con un error o no encuentra algo, explícaselo al usuario.
- Si el usuario pide varias cosas en un mensaje, hazlas todas.
- Montos en CLP: "5 lucas" = 5000, "una luca" = 1000, "un palo" = 1000000. Escribe montos como $5.000.
- Las fechas para herramientas van en formato YYYY-MM-DD, calculadas desde la fecha de hoy indicada en <datos>.
- Si falta un dato imprescindible para una acción (por ejemplo, el monto de un gasto), pregúntalo en vez de adivinar.
- Puedes dar consejos breves sobre organización, finanzas personales, entrenamiento o hábitos cuando te los pidan, basándote en sus datos.`;

export type RespuestaIA = { texto: string; acciones: Accion[] };

/**
 * Pregunta a Claude. Lanza un error si no hay API key, no hay internet o la
 * API falla: quien llama debe usar el modo sin internet como respaldo.
 */
export async function preguntarIA(db: SQLiteDatabase, frase: string, historial: MensajeChat[]): Promise<RespuestaIA> {
  const apiKey = await leerApiKey();
  if (!apiKey) throw new Error('sin-api-key');

  // En una app de celular el SDK debe permitir correr "en el cliente": la key es tuya y vive cifrada en tu teléfono.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000 });
  const acciones: Accion[] = [];

  // Conversación de hoy (últimos 12 mensajes) para que entienda "¿y mañana?", "eso mismo", etc.
  const previos: Anthropic.Beta.BetaMessageParam[] = historial
    .filter((m) => m.text.trim())
    .slice(-12)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  while (previos.length && previos[0].role !== 'user') previos.shift();

  const resumen = await construirResumen(db);

  const final = await client.beta.messages.toolRunner({
    model: MODELO,
    max_tokens: 8000,
    // Chat simple: esfuerzo bajo = respuestas rápidas y baratas.
    output_config: { effort: 'low' },
    // Si el modelo declina por seguridad, la API reintenta sola con otro modelo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    max_iterations: 6,
    // Conversación corta: mandamos todo cada vez (sin la función beta de "threads").
    thread: false,
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    tools: crearHerramientas(db, acciones),
    messages: [
      ...previos,
      {
        role: 'user',
        content: [
          { type: 'text', text: `<datos>\n${resumen}\n</datos>` },
          { type: 'text', text: frase },
        ],
      },
    ],
  });

  if (final.stop_reason === 'refusal') {
    return { texto: 'Esa no te la puedo responder. ¿Te ayudo con otra cosa?', acciones };
  }
  const texto = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { texto: texto || 'Listo ✅', acciones };
}

/** Mensaje amable según el error de la API. */
export function explicarErrorIA(e: unknown): string | null {
  if (e instanceof Anthropic.AuthenticationError) return 'Tu API key de Claude no funciona. Revísala en Ajustes → Asistente.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Tu cuenta de Anthropic no tiene permiso para este modelo.';
  if (e instanceof Anthropic.RateLimitError) return 'Claude está con mucha demanda o se acabó tu saldo. Usé el modo sin internet.';
  if (e instanceof Anthropic.APIConnectionError) return null; // sin internet: respaldo silencioso
  return null;
}
