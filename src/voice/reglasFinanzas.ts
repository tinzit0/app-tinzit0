/**
 * Órdenes de plata y asistencia automática:
 *   "¿cuánto puedo gastar hoy?", "¿cómo voy a terminar el mes?",
 *   "escanea una boleta", "revisa los gastos del banco", "activa la asistencia automática".
 * Funciones puras: se prueban en scripts/test-finanzas.ts.
 */
export type IntencionFinanzas =
  | { tipo: 'gasto_diario' }
  | { tipo: 'proyeccion_mes' }
  | { tipo: 'finanzas_ir'; ruta: string; nombre: string };

export function reglasFinanzas(t: string): IntencionFinanzas | null {
  if (/^(como (hago|puedo|se|activo|uso|funciona)|para que sirve)\b/.test(t)) return null;

  if (/\b(escanea(r)?|escaneame|sacale (una )?foto a|lee(r)?|leeme|anota|registra)\s+(una |la |esta |mi |el )?(boleta|ticket|recibo|comprobante)\b/.test(t)) {
    return { tipo: 'finanzas_ir', ruta: '/boleta', nombre: 'el escáner de boletas' };
  }
  if (/\b(gastos? (del banco|detectados?|automaticos?|pendientes? del banco)|revisa(r)? (los |mis )?gastos del banco|compras del banco|avisos del banco)\b/.test(t)) {
    return { tipo: 'finanzas_ir', ruta: '/gastos-banco', nombre: 'los gastos del banco' };
  }
  if (/\b(asistencia automatica|activa(r)? la asistencia|ubicacion de (la u|mi u|la universidad)|guarda(r)? (la ubicacion de )?(la u|mi u))\b/.test(t)) {
    return { tipo: 'finanzas_ir', ruta: '/campus', nombre: 'la asistencia automática' };
  }

  if (/\b(cuanto (puedo|me queda para|podria) gastar|cuanta plata (puedo gastar|me queda (para hoy|hoy|al dia|por dia))|cuantas lucas (puedo gastar|me quedan (hoy|para hoy))|mi limite (de hoy|diario)|cuanto tengo para (hoy|gastar hoy)|puedo gastar hoy)\b/.test(t)) {
    return { tipo: 'gasto_diario' };
  }
  if (/\b(como (voy a terminar|termino|terminare|cierro) el mes|cuanto voy a gastar (este|el) mes|proyeccion( del mes| de gastos)?|me va a alcanzar|como cierro el mes)\b/.test(t)) {
    return { tipo: 'proyeccion_mes' };
  }
  return null;
}
