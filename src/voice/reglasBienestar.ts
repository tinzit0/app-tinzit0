/**
 * Órdenes de bienestar emocional:
 *   "estoy a mil", "necesito calmarme", "tengo ganas de hacer una tontera", "mi plan de crisis",
 *   "llenar mi tarjeta", "mis patrones", "me siento un 4".
 * Y lo más importante: si la frase habla de hacerse daño, responde con cuidado y con el *4141.
 * Funciones puras: se prueban en scripts/test-bienestar.ts.
 */
import { detectarRiesgo } from '@/bienestar/logica';

export type IntencionBienestar =
  | { tipo: 'crisis' }
  | { tipo: 'animo_registrar'; valor: number }
  | { tipo: 'bienestar_ir'; ruta: string; nombre: string };

const NUM: Record<string, number> = { cero: 0, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

export function reglasBienestar(t: string): IntencionBienestar | null {
  if (detectarRiesgo(t)) return { tipo: 'crisis' };
  if (/^(como (hago|puedo|se|uso|funciona)|para que sirve)\b/.test(t)) return null;

  // "me siento un 4", "mi animo es 7", "hoy estoy en un 3"
  const m = /\b(?:me siento (?:en )?(?:un |una )?|mi animo (?:es|esta en|de hoy es) (?:un )?|hoy estoy (?:en )?un |animo )(\d{1,2}|cero|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/.exec(t);
  if (m) {
    const v = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1]];
    if (v != null && v >= 0 && v <= 10) return { tipo: 'animo_registrar', valor: v };
  }

  if (/\b(plan de (crisis|seguridad|emergencia)|lineas? de ayuda|numero de ayuda|a quien llamo)\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/plan-crisis', nombre: 'tu plan de crisis' };
  }
  if (/\b((surfear|surfea)( el| un)? impulso|tengo (muchas )?ganas de (hacer (una )?(tontera|lesera|algo malo|algo que me arrepienta)|mandarle|escribirle|gastar|comprar|tomar|fumar|beber)|tengo un impulso|me quiero mandar un condoro)\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/impulso', nombre: 'surfear el impulso' };
  }
  if (/\b(estoy a mil|estoy (muy )?mal|me siento (muy )?mal|necesito calmarme|calmame|ayudame a calmarme|estoy colapsando|estoy colapsad[oa]|ataque de (ansiedad|panico|angustia)|tengo (mucha )?(angustia|ansiedad|rabia)|no doy mas|estoy desbordad[oa]|estoy explotando)\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/calma', nombre: 'calma' };
  }
  if (/\b(quiero respirar|respiracion guiada|ejercicio de respiracion|ayudame a respirar)\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/calma?modo=respirar', nombre: 'la respiración guiada' };
  }
  if (/\b(tarjeta (diaria|del dia|de hoy)|registrar (mi )?animo|anotar (mi )?(animo|dia)|diario emocional)\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/tarjeta-diaria', nombre: 'tu tarjeta de hoy' };
  }
  if (/\b(mis patrones|patrones|como ha estado mi animo|como va mi animo|mi animo (de la semana|del mes))\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/patrones', nombre: 'tus patrones' };
  }
  if (/\b(habilidades( dbt)?|dbt)\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/habilidades', nombre: 'las habilidades' };
  }
  if (/\b(bienestar|salud mental)\b/.test(t)) {
    return { tipo: 'bienestar_ir', ruta: '/bienestar', nombre: 'Bienestar' };
  }
  return null;
}
