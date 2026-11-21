/**
 * Utilidades de texto para el asistente: normalizar frases y detectar
 * la palabra de activación "ey Tinzit0".
 */

/** minúsculas, sin tildes, sin signos de puntuación, espacios simples. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cómo puede escribir el reconocedor de voz "Tinzit0":
 * tinzito, tin zito, tinsito, tin sito, tinzit0, tincito, tensito, quinsito…
 */
const NOMBRE = '(?:t[ie]n\\s?[zsc]it[o0]|t[ie]n\\s?[zsc]ito|tinzit0|tin\\s?zi\\s?to|quin\\s?[sz]ito|t[ie]n[zs]i)';
const SALUDO = '(?:ey|hey|ei|oye|hei|e|hola|ok|okay)';
const WAKE = new RegExp(`(?:^|\\s)${SALUDO}\\s*,?\\s*${NOMBRE}(?:\\s|$)`);
const SOLO_NOMBRE = new RegExp(`^${NOMBRE}(?:\\s|$)`);

/**
 * Si la frase contiene la palabra de activación, devuelve lo que viene
 * DESPUÉS (el comando, puede ser vacío ""). Si no, devuelve null.
 *   "ey tinzito qué me toca hoy" → "que me toca hoy"
 *   "oye tin sito"               → ""
 *   "tengo que ir al tinto"      → null
 */
export function detectarActivacion(frase: string): string | null {
  const t = normalizar(frase);
  const m = WAKE.exec(t) ?? SOLO_NOMBRE.exec(t);
  if (!m) return null;
  return t.slice(m.index + m[0].length).trim();
}

/** Quita la palabra de activación del inicio, si está. */
export function sinActivacion(frase: string): string {
  const r = detectarActivacion(frase);
  return r ?? normalizar(frase);
}

/** Parecido entre dos textos (0 a 1), por palabras en común. Sirve para encontrar "la tarea X". */
export function parecido(a: string, b: string): number {
  const ignorar = new Set(['la', 'el', 'los', 'las', 'de', 'del', 'a', 'al', 'un', 'una', 'mi', 'que', 'y', 'en', 'tarea', 'habito']);
  const pa = normalizar(a).split(' ').filter((w) => w.length > 1 && !ignorar.has(w));
  const pb = new Set(normalizar(b).split(' ').filter((w) => w.length > 1 && !ignorar.has(w)));
  if (pa.length === 0 || pb.size === 0) return 0;
  let comunes = 0;
  for (const w of pa) {
    if (pb.has(w) || [...pb].some((x) => x.startsWith(w.slice(0, 4)) && w.length >= 4)) comunes++;
  }
  return comunes / Math.max(pa.length, pb.size);
}
