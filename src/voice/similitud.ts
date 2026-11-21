/**
 * Entendimiento "por parecido": cuando una frase no calza con ninguna regla,
 * buscamos la frase de ejemplo más parecida (corpus.ts) y la usamos.
 *
 * Cómo se mide el parecido (sin IA, instantáneo):
 * 1. Normalizamos (minúsculas, sin tildes) y quitamos palabras de relleno.
 * 2. Llevamos cada palabra a su "raíz" (gastado, gasté, gastos → gast) y
 *    unificamos sinónimos (plata = lucas = dinero → plata).
 * 3. Comparamos los conjuntos de raíces (coeficiente de Dice), con un premio
 *    si coinciden palabras en el mismo orden.
 */
import { normalizar } from './texto';

const RELLENO = new Set(
  'a al el la los las un una unos unas de del en y o que me mi mis te tu tus se le lo es son por para con como cual cuales ya pues oye ey hey tinzito jarvis porfa porfavor favor dime decime puedes podrias quiero quisiera necesito saber hay esta estan este esta esto eso ese algo cuanto cuanta cuantos cuantas'.split(' '),
);
// Ojo: "cuanto" se trata aparte (ver CLAVES) para no perder el sentido de pregunta de monto.

const SINONIMOS: Record<string, string> = {
  plata: 'plata', dinero: 'plata', lucas: 'plata', luca: 'plata', pesos: 'plata', gastos: 'gasto', gaste: 'gasto', gastado: 'gasto', gastar: 'gasto', gastando: 'gasto', compras: 'gasto', compre: 'gasto',
  gimnasio: 'gym', entreno: 'gym', entrenamiento: 'gym', entrenar: 'gym', pesas: 'gym', rutina: 'gym',
  pendientes: 'tarea', pendiente: 'tarea', tareas: 'tarea', cosas: 'tarea', quehaceres: 'tarea', hacer: 'tarea',
  llover: 'lluvia', llueve: 'lluvia', lloviendo: 'lluvia', paraguas: 'lluvia', tiempo: 'clima', temperatura: 'clima', frio: 'clima', calor: 'clima',
  ahorro: 'meta', ahorrar: 'meta', ahorros: 'meta', metas: 'meta', alcancia: 'meta',
  habitos: 'habito', costumbre: 'habito', racha: 'habito',
  notas: 'nota', apuntes: 'nota', apunte: 'nota',
  medallas: 'logro', logros: 'logro', trofeos: 'logro', premios: 'logro',
  kilos: 'peso', pese: 'peso', pesando: 'peso', bascula: 'peso', pesa: 'peso',
  hoy: 'hoy', ahora: 'hoy', manana: 'manana', semana: 'semana', mes: 'mes', mensual: 'mes',
};

/** Raíz simple: quita plurales y terminaciones comunes, y corta a 5 letras. */
function raiz(w: string): string {
  if (SINONIMOS[w]) return SINONIMOS[w];
  let r = w
    .replace(/(amientos?|imientos?|aciones|acion|mente)$/, '')
    .replace(/(ando|iendo|aste|iste|aron|ieron)$/, '')
    .replace(/(es|s)$/, '');
  if (r.length > 5) r = r.slice(0, 5);
  return r;
}

export function tokens(frase: string): string[] {
  return normalizar(frase)
    .split(' ')
    .filter((w) => w.length > 1 && !RELLENO.has(w))
    .map(raiz)
    .filter(Boolean);
}

/** Parecido entre 0 y 1. */
export function parecidoFrases(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let comunes = 0;
  for (const x of A) if (B.has(x)) comunes++;
  const dice = (2 * comunes) / (A.size + B.size);
  // Premio por pares de palabras en el mismo orden
  const pares = (xs: string[]) => new Set(xs.slice(1).map((x, i) => `${xs[i]}_${x}`));
  const pa = pares(a);
  const pb = pares(b);
  let pc = 0;
  for (const p of pa) if (pb.has(p)) pc++;
  const bonus = pa.size && pb.size ? (0.15 * pc) / Math.min(pa.size, pb.size) : 0;
  return Math.min(1, dice + bonus);
}
