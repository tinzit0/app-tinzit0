/**
 * Utilidades de fechas, en español de Chile.
 * Guardamos las fechas como texto 'YYYY-MM-DD' (hora local) porque es simple
 * de comparar y ordenar en la base de datos.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Convierte una fecha a 'YYYY-MM-DD' usando la hora local del celular. */
/** La fecha de hace `n` días (a la misma hora). */
export function haceDias(n: number, desde: Date = new Date()): Date {
  return new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() - n, desde.getHours(), desde.getMinutes());
}

export function toISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convierte 'YYYY-MM-DD' de vuelta a Date (a medianoche local). */
export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Día de la semana con lunes = 1 … domingo = 7 (como se usa en Chile). */
export function weekdayMonFirst(d: Date = new Date()): number {
  const js = d.getDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

/** Lunes de la semana de la fecha dada (la semana parte el lunes). */
export function startOfWeek(d: Date = new Date()): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - (weekdayMonFirst(r) - 1));
  return r;
}

/** Domingo de la semana de la fecha dada. */
export function endOfWeek(d: Date = new Date()): Date {
  const r = startOfWeek(d);
  r.setDate(r.getDate() + 6);
  return r;
}

/** Nombre del día: "lunes", "martes"… */
export function nombreDia(d: Date = new Date()): string {
  return DIAS[d.getDay()];
}

/** Nombre del día a partir de 1..7 (lunes primero). */
export function nombreDiaMonFirst(n: number): string {
  return DIAS[n % 7];
}

/** "Jueves 20 de noviembre" */
export function fechaLarga(d: Date = new Date()): string {
  const dia = DIAS[d.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** "20 nov" — para listas y notas. */
export function fechaCorta(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** Saludo según la hora del día. */
export function saludo(d: Date = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
