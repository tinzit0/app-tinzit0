/**
 * Personalidad del asistente.
 * - "jarvis": mayordomo elegante, sereno y con un toque de ironía. Te llama "señor"
 *   (o como elijas en Ajustes). Sin modismos ni emojis.
 * - "cercano": el tono chileno de siempre.
 *
 * Funciona transformando las respuestas del ejecutor: así todas las funciones
 * del asistente hablan con la misma personalidad sin duplicar código.
 */
import type { Respuesta } from '@/voice/ejecutar';
import type { TipoIntencion } from '@/voice/interpretar';

export type Estilo = 'jarvis' | 'cercano';

const azar = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Reemplazos de frases chilenas por su versión "Jarvis". */
const REEMPLAZOS: [RegExp, string][] = [
  [/^¡?Listo,?\s*/i, 'Hecho. '],
  [/^Hecho:\s*/i, 'Hecho. Registré '],
  [/^Dale,\s*/i, 'Por supuesto. '],
  [/^¡Bien!\s*/i, 'Excelente. '],
  [/^¡Eso!\s*/i, 'Muy bien. '],
  [/^¡Abonado!\s*/i, 'Abono registrado. '],
  [/^¡Meta creada!\s*/i, 'Meta creada. '],
  [/^Anotado:\s*/i, 'Registrado: '],
  [/^Anotado en tus notas:\s*/i, 'Nota guardada: '],
  [/^Uy, eso no lo cacho todavía\.?\s*/i, 'Me temo que no entendí la instrucción. '],
  [/^Perdón, no te entendí bien\.?\s*/i, 'Disculpa, no logré entenderte. '],
  [/^Mmm, esa no me la sé\.?\s*/i, 'No tengo esa capacidad todavía. '],
  [/^Mmm,\s*/i, ''],
  [/Puedes pedirme cosas como:/g, 'Puedo ayudarte con instrucciones como:'],
  [/¡Bien ahí!/g, 'Bien hecho.'],
  [/Bien ahí/g, 'Bien hecho'],
  [/Pisa el freno hasta el lunes/g, 'Te sugiero moderar los gastos hasta el lunes'],
  [/Ojo,? que /g, 'Atención: '],
  [/Ojo:/g, 'Atención:'],
  [/^Ojo /g, 'Atención, '],
  [/tranqui\b/g, 'tranquilo'],
  [/Día libre\b/g, 'Día despejado'],
  [/Semana tranquila/g, 'Una semana despejada'],
  [/¡Sigue así!/g, 'Excelente ritmo.'],
  [/¡Dale con todo!/g, 'Te deseo un buen entrenamiento.'],
  [/A darle\./g, 'Mucho éxito.'],
  [/No la sueltes!/g, 'No la pierdas.'],
  [/¡No la sueltes!/g, 'No la pierdas.'],
  [/Que no se te pase\./g, 'No lo olvides.'],
  [/Vamos 👉/g, 'Enseguida.'],
  [/^Vamos\b/g, 'Enseguida'],
];

/** Quita emojis y símbolos decorativos. */
function sinEmojis(t: string) {
  return t
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/️/g, '')
    .replace(/[ \t]+([.,])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function saludoHora() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

/** Respuestas que en modo Jarvis se escriben completas (no solo se transforman). */
function propias(tipo: TipoIntencion | undefined, trato: string): string | null {
  switch (tipo) {
    case 'saludo':
      return azar([
        `${saludoHora()}, ${trato}. Tinzit0 en línea. ¿En qué te ayudo?`,
        `Tinzit0 a tu servicio, ${trato}.`,
        `${saludoHora()}, ${trato}. Aquí Tinzit0, todos los sistemas operativos.`,
      ]);
    case 'gracias':
      return azar([`Un placer, ${trato}.`, 'Para eso estoy.', `Siempre a tu disposición, ${trato}.`]);
    case 'motivacion':
      return azar([
        `Si me permites, ${trato}: el progreso rara vez es espectacular, pero siempre es acumulativo. Un paso más hoy.`,
        `Los registros indican que cumples más de lo que crees, ${trato}. Continúa.`,
        `Recomiendo una tarea pequeña ahora mismo. El impulso hará el resto.`,
      ]);
    default:
      return null;
  }
}

/** Aplica la personalidad a una respuesta. */
export function aplicarEstilo(r: Respuesta, estilo: Estilo, trato: string): Respuesta {
  if (estilo === 'cercano') return r;
  const propia = propias(r.intencion, trato);
  let texto = propia ?? r.texto;
  if (!propia) {
    for (const [re, por] of REEMPLAZOS) texto = texto.replace(re, por);
    // De vez en cuando agrega el trato a confirmaciones cortas: "Hecho, señor."
    if (/^Hecho\. /.test(texto) && Math.random() < 0.6) texto = texto.replace(/^Hecho\. /, `Hecho, ${trato}. `);
    if (/^Por supuesto\. /.test(texto) && Math.random() < 0.6) texto = texto.replace(/^Por supuesto\. /, `Por supuesto, ${trato}. `);
  }
  texto = sinEmojis(texto);
  // Mayúscula después del primer punto: "Hecho, señor. Anoté…"
  texto = texto.replace(/^([^.!?]{1,40}[.!?]\s)([a-záéíóúñ])/, (_, a: string, b: string) => a + b.toUpperCase());
  return { ...r, texto: texto.charAt(0).toUpperCase() + texto.slice(1) };
}
