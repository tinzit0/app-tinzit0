/**
 * Lógica del Modo Estudiante (funciones puras, sin base de datos).
 * Se prueban en scripts/test-estudio.ts.
 *
 * - Notas chilenas de 1.0 a 7.0, promedio ponderado y "¿cuánto necesito?"
 * - Plan de estudio: reparte horas entre hoy y el día antes de la prueba
 * - Horario: qué clase hay ahora y cuál viene
 * - Tarjetas con repetición espaciada (estilo Anki / SM-2)
 * - Tarjetas y resúmenes automáticos a partir de apuntes (sin IA)
 */
import { fromISODate, toISODate, weekdayMonFirst } from '@/utils/fechas';

// ---------- Notas ----------

export type EvalNota = { weight: number; grade: number | null };

export const NOTA_MIN = 1.0;
export const NOTA_MAX = 7.0;

/** Redondeo chileno a un decimal (3,95 → 4,0). */
export function redondearNota(x: number): number {
  return Math.round(x * 10 + 1e-9) / 10;
}

/** "5,5" (con coma, como en Chile). */
export function formatoNota(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return redondearNota(x).toFixed(1).replace('.', ',');
}

/** Lee "5,5", "5.5", "55" (→ 5,5) o "6" como nota válida, o null. */
export function leerNota(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  let n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n >= 10 && n <= 70 && Number.isInteger(n)) n = n / 10; // "55" → 5.5
  if (n < NOTA_MIN || n > NOTA_MAX) return null;
  return redondearNota(n);
}

/**
 * Promedio de lo que ya tiene nota.
 * Si las evaluaciones tienen ponderación, es ponderado; si no, promedio simple.
 */
export function promedio(evals: EvalNota[]): number | null {
  const conNota = evals.filter((e) => e.grade != null) as { weight: number; grade: number }[];
  if (!conNota.length) return null;
  const pesos = conNota.reduce((s, e) => s + (e.weight > 0 ? e.weight : 0), 0);
  if (pesos > 0) {
    const sinPeso = conNota.filter((e) => !(e.weight > 0));
    if (!sinPeso.length) return conNota.reduce((s, e) => s + e.grade * e.weight, 0) / pesos;
  }
  return conNota.reduce((s, e) => s + e.grade, 0) / conNota.length;
}

/**
 * Subnotas: una evaluación (ej: "Controles", 10% del ramo) puede ser el promedio de varias notas.
 * Cada subnota tiene su peso DENTRO de la evaluación (0 en todas = promedio simple).
 * - nota: la nota final de la evaluación, solo cuando todas las subnotas tienen nota
 *   (así el "¿cuánto necesito?" no se engaña con una nota a medias).
 * - parcial: cómo vas con las que ya tienen nota (para mostrarlo en pantalla).
 */
export function notaDeSubnotas(subnotas: EvalNota[]): { nota: number | null; parcial: number | null; conNota: number; total: number } {
  const conNota = subnotas.filter((e) => e.grade != null).length;
  const parcial = promedio(subnotas);
  const redondear = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  return {
    nota: subnotas.length > 0 && conNota === subnotas.length ? redondear(parcial) : null,
    parcial: redondear(parcial),
    conNota,
    total: subnotas.length,
  };
}

export type Necesaria =
  | { estado: 'sin_datos' }
  | { estado: 'sin_restante'; final: number; aprobado: boolean }
  | { estado: 'aprobado'; restante: number; final: number }
  | { estado: 'imposible'; restante: number; necesaria: number }
  | { estado: 'necesita'; restante: number; necesaria: number };

/**
 * ¿Qué nota necesitas en lo que queda para llegar a `meta` (4,0 por defecto)?
 * Usa las ponderaciones: lo que queda = 100% − lo ya evaluado.
 */
export function notaNecesaria(evals: EvalNota[], meta = 4.0): Necesaria {
  const conPeso = evals.filter((e) => e.weight > 0);
  if (!conPeso.length) {
    const p = promedio(evals);
    return p == null ? { estado: 'sin_datos' } : { estado: 'sin_restante', final: p, aprobado: redondearNota(p) >= meta };
  }
  const evaluado = conPeso.filter((e) => e.grade != null) as { weight: number; grade: number }[];
  const pesoEvaluado = evaluado.reduce((s, e) => s + e.weight, 0);
  const acumulado = evaluado.reduce((s, e) => s + e.grade * e.weight, 0);
  const total = Math.max(100, conPeso.reduce((s, e) => s + e.weight, 0));
  const restante = total - pesoEvaluado;
  if (restante <= 0.0001) {
    const final = acumulado / total;
    return { estado: 'sin_restante', final, aprobado: redondearNota(final) >= meta };
  }
  const necesaria = (meta * total - acumulado) / restante;
  if (necesaria <= NOTA_MIN) return { estado: 'aprobado', restante, final: (acumulado + NOTA_MIN * restante) / total };
  if (necesaria > NOTA_MAX) return { estado: 'imposible', restante, necesaria };
  // Redondeamos hacia arriba al décimo: con esa nota sí alcanzas.
  return { estado: 'necesita', restante, necesaria: Math.ceil(necesaria * 10 - 1e-9) / 10 };
}

/** Frase corta para la UI o la voz. */
export function textoNecesaria(n: Necesaria, meta = 4.0): string {
  switch (n.estado) {
    case 'sin_datos':
      return 'Aún no tienes notas en este ramo.';
    case 'sin_restante':
      return n.aprobado ? `Terminaste con ${formatoNota(n.final)}: aprobado.` : `Quedaste con ${formatoNota(n.final)}.`;
    case 'aprobado':
      return `Ya tienes el ramo asegurado: aunque saques un 1,0 en el ${Math.round(n.restante)}% que queda, llegas al ${formatoNota(meta)}.`;
    case 'imposible':
      return `Con el ${Math.round(n.restante)}% que queda no alcanza para el ${formatoNota(meta)} (necesitarías ${formatoNota(n.necesaria)}). Habla con tu profe por si hay examen o recuperativa.`;
    case 'necesita':
      return `Necesitas un ${formatoNota(n.necesaria)} en el ${Math.round(n.restante)}% que queda para el ${formatoNota(meta)}.`;
  }
}

// ---------- Asistencia ----------

export function porcentajeAsistencia(presentes: number, total: number): number | null {
  return total > 0 ? Math.round((presentes / total) * 100) : null;
}

// ---------- Plan de estudio ----------

export type BloquePlan = { fecha: string; horas: number };

/**
 * Reparte `horas` de estudio entre hoy y el día ANTES de la prueba,
 * en sesiones de al menos 1 hora (en trozos de media hora), cargando más los días cercanos a la prueba.
 */
export function planEstudio(horas: number, fechaPrueba: string, hoy = new Date()): BloquePlan[] {
  if (!(horas > 0)) return [];
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const fin = fromISODate(fechaPrueba);
  const dias: string[] = [];
  for (let d = new Date(inicio); d < fin && dias.length < 60; d.setDate(d.getDate() + 1)) dias.push(toISODate(d));
  if (!dias.length) dias.push(toISODate(inicio)); // la prueba es hoy (o ya pasó): todo hoy
  const unidades = Math.round(horas * 2); // medias horas
  // Sesiones de al menos 1 hora (si alcanza): 4 h → 4 días de 1 h, los más cercanos a la prueba.
  const usar = dias.slice(-Math.min(dias.length, Math.max(1, Math.floor(horas))));
  const base = Math.floor(unidades / usar.length);
  let sobra = unidades - base * usar.length;
  const out = usar.map((fecha) => ({ fecha, horas: base / 2 }));
  // Lo que sobra va a los días más cercanos a la prueba.
  for (let k = out.length - 1; sobra > 0 && k >= 0; k--, sobra--) out[k].horas += 0.5;
  return out.filter((b) => b.horas > 0);
}

/** "1,5 h" / "45 min" */
export function formatoHoras(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;
}

// ---------- Horario ----------

export type BloqueClase = { weekday: number; start_time: string; end_time: string };

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Bloques de un día, ordenados por hora. */
export function bloquesDelDia<T extends BloqueClase>(bloques: T[], fecha = new Date()): T[] {
  const d = weekdayMonFirst(fecha);
  return bloques.filter((b) => b.weekday === d).sort((a, b) => minutos(a.start_time) - minutos(b.start_time));
}

/**
 * Qué clase hay AHORA y cuál es la SIGUIENTE (puede ser otro día).
 * `enDias` = 0 si la siguiente es hoy, 1 si mañana, etc.
 */
export function claseAhora<T extends BloqueClase>(bloques: T[], ahora = new Date()): { actual: T | null; siguiente: (T & { enDias: number }) | null } {
  const hoy = weekdayMonFirst(ahora);
  const m = ahora.getHours() * 60 + ahora.getMinutes();
  const actual = bloques.find((b) => b.weekday === hoy && minutos(b.start_time) <= m && m < minutos(b.end_time)) ?? null;
  for (let k = 0; k < 7; k++) {
    const dia = ((hoy - 1 + k) % 7) + 1;
    const candidatos = bloques
      .filter((b) => b.weekday === dia && (k > 0 || minutos(b.start_time) > m))
      .sort((a, b) => minutos(a.start_time) - minutos(b.start_time));
    if (candidatos[0]) return { actual, siguiente: { ...candidatos[0], enDias: k } };
  }
  return { actual, siguiente: null };
}

/** Minutos que faltan para "HH:MM" de hoy (negativo si ya pasó). */
export function minutosHasta(hhmm: string, ahora = new Date()): number {
  return minutos(hhmm) - (ahora.getHours() * 60 + ahora.getMinutes());
}

// ---------- Tarjetas: repetición espaciada (SM-2 simplificado) ----------

export type EstadoTarjeta = { ease: number; interval: number; reps: number };
/** 0 = otra vez · 1 = difícil · 2 = bien · 3 = fácil */
export type Calidad = 0 | 1 | 2 | 3;

export function repasar(t: EstadoTarjeta, calidad: Calidad, hoy = new Date()): EstadoTarjeta & { due: string } {
  let { ease, interval, reps } = t;
  if (calidad === 0) {
    reps = 0;
    interval = 0; // vuelve hoy mismo
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    if (reps === 1) interval = calidad === 3 ? 3 : 1;
    else if (reps === 2) interval = calidad === 1 ? 3 : calidad === 3 ? 7 : 5;
    else interval = Math.round(interval * (calidad === 1 ? 1.2 : calidad === 3 ? ease * 1.3 : ease));
    ease = Math.max(1.3, ease + (calidad === 1 ? -0.15 : calidad === 3 ? 0.15 : 0));
    interval = Math.max(1, Math.min(interval, 365));
  }
  const due = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + interval));
  return { ease: Math.round(ease * 100) / 100, interval, reps, due };
}

/** Lo que mostramos en cada botón: "10 min", "1 día", "5 días". */
export function textoIntervalo(t: EstadoTarjeta, calidad: Calidad): string {
  const r = repasar(t, calidad);
  if (r.interval === 0) return 'ahora';
  if (r.interval === 1) return '1 día';
  if (r.interval < 30) return `${r.interval} días`;
  const meses = Math.round(r.interval / 30);
  return meses === 1 ? '1 mes' : `${meses} meses`;
}

// ---------- Tarjetas automáticas desde apuntes ----------

export type TarjetaNueva = { front: string; back: string };

/**
 * Arma tarjetas a partir de apuntes, sin IA:
 *   "Mitocondria: produce energía"     → ¿Mitocondria? / produce energía
 *   "Fotosíntesis - proceso de …"       → idem
 *   "La célula es la unidad básica …"   → ¿Qué es la célula? / la unidad básica …
 *   "P: …  R: …" (formato de la IA)     → pregunta / respuesta
 */
export function tarjetasDesdeTexto(texto: string): TarjetaNueva[] {
  const out: TarjetaNueva[] = [];
  const lineas = texto.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  for (let k = 0; k < lineas.length; k++) {
    const l = lineas[k];
    // Formato pregunta/respuesta
    const p = /^(?:p|pregunta)\s*[:.-]\s*(.+)$/i.exec(l);
    const r = lineas[k + 1] && /^(?:r|respuesta)\s*[:.-]\s*(.+)$/i.exec(lineas[k + 1]);
    if (p && r) {
      out.push({ front: p[1].trim(), back: r[1].trim() });
      k++;
      continue;
    }
    // "término: definición" o "término - definición" o "término = definición"
    const def = /^([^:=–—-]{2,60}?)\s*(?::|=|\s[-–—]\s)\s*(.{3,})$/.exec(l);
    if (def && def[1].split(/\s+/).length <= 7) {
      const termino = def[1].trim().replace(/[.;]$/, '');
      out.push({ front: /\?$/.test(termino) ? termino : `¿${mayus(termino)}?`, back: def[2].trim() });
      continue;
    }
    // "X es Y" / "X son Y" (X corto)
    const es = /^((?:el|la|los|las|un|una)?\s*[^,.]{2,40}?)\s+(es|son|se define como|consiste en)\s+(.{5,})$/i.exec(l);
    if (es && es[1].trim().split(/\s+/).length <= 5) {
      const sujeto = es[1].trim();
      const verbo = es[2].toLowerCase() === 'son' ? 'son' : 'es';
      out.push({ front: `¿Qué ${verbo} ${minus(sujeto)}?`, back: es[3].trim().replace(/\.$/, '') });
    }
  }
  // Sin duplicados
  const vistos = new Set<string>();
  return out.filter((t) => {
    const k = t.front.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const minus = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// ---------- Resumen automático (sin IA) ----------

const VACIAS = new Set(
  'a al algo ante antes asi bien cada como con contra cual cuando de del desde donde dos el ella ellos en entre era es esa ese eso esta este esto estos fue ha hace hay la las le les lo los mas me mi muy no nos o otra otro para pero poco por porque que se sea segun ser si sin sobre son su sus tambien te tiene todo tu un una uno unos y ya yo eh este bueno entonces osea o sea ok vamos vale ahi aca'.split(' '),
);

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Parte un texto en oraciones (si no hay puntos, en trozos de ~25 palabras). */
export function oraciones(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  let partes = limpio.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (partes.length <= 1 && limpio.split(' ').length > 40) {
    const palabras = limpio.split(' ');
    partes = [];
    for (let k = 0; k < palabras.length; k += 25) partes.push(palabras.slice(k, k + 25).join(' '));
  }
  return partes;
}

/**
 * Resumen "extractivo": elige las oraciones con las palabras más repetidas
 * del texto (las ideas principales) y las devuelve en su orden original.
 */
export function resumirTexto(texto: string, maxOraciones = 5): string[] {
  const ors = oraciones(texto);
  if (ors.length <= maxOraciones) return ors;
  const frec = new Map<string, number>();
  const palabrasDe = (s: string) => sinTildes(s).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !VACIAS.has(w));
  for (const o of ors) for (const w of palabrasDe(o)) frec.set(w, (frec.get(w) ?? 0) + 1);
  const puntaje = ors.map((o, idx) => {
    const ws = palabrasDe(o);
    const s = ws.reduce((acc, w) => acc + (frec.get(w) ?? 0), 0) / Math.sqrt(ws.length || 1);
    return { idx, s };
  });
  const elegidas = puntaje.sort((a, b) => b.s - a.s).slice(0, maxOraciones).map((p) => p.idx).sort((a, b) => a - b);
  return elegidas.map((k) => ors[k]);
}

/** Palabras clave (las más repetidas), para el título de una clase grabada. */
export function palabrasClave(texto: string, n = 5): string[] {
  const frec = new Map<string, number>();
  for (const w of sinTildes(texto).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/)) {
    if (w.length > 4 && !VACIAS.has(w)) frec.set(w, (frec.get(w) ?? 0) + 1);
  }
  return [...frec.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

// ---------- Buscar un ramo por nombre hablado ----------

/** "calculo" encuentra "Cálculo I"; "fisica" encuentra "Física General". */
export function buscarRamoPorNombre<T extends { name: string }>(ramos: T[], texto: string): T | null {
  const q = sinTildes(texto).replace(/^(el|la|los|las|mi|ramo de|ramo|curso de|curso|clase de|clases de)\s+/, '').replace(/[^a-z0-9ñ ]/g, ' ').trim();
  if (!q) return null;
  let mejor: { r: T; s: number } | null = null;
  for (const r of ramos) {
    const n = sinTildes(r.name).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
    let s = 0;
    if (n === q) s = 1;
    else if (n.startsWith(q) || q.startsWith(n)) s = 0.9;
    else if (n.includes(q) || q.includes(n)) s = 0.8;
    else {
      const qa = q.split(' ').filter((w) => w.length > 2);
      const na = n.split(' ').filter((w) => w.length > 2);
      const comunes = qa.filter((w) => na.some((x) => x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4)))).length;
      s = qa.length ? (comunes / Math.max(qa.length, na.length)) * 0.75 : 0;
    }
    if (s > (mejor?.s ?? 0)) mejor = { r, s };
  }
  return mejor && mejor.s >= 0.5 ? mejor.r : null;
}

// ---------- Asistencia automática por ubicación ----------

export type Visita = { entrada: Date; salida: Date | null };

const enFecha = (dia: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h || 0, m || 0);
};

/**
 * Clases de `dia` a las que estuviste, según tus visitas a la U:
 * - si estuviste dentro al menos `minimo` minutos durante la clase, o
 * - si llegaste antes de los primeros 15 min de la clase y sigues dentro (la clase ya empezó).
 */
export function clasesAsistidas<T extends BloqueClase>(bloques: T[], visitas: Visita[], dia: Date, ahora = new Date(), minimo = 15): T[] {
  return bloquesDelDia(bloques, dia).filter((b) => {
    const ini = enFecha(dia, b.start_time).getTime();
    const fin = enFecha(dia, b.end_time).getTime();
    if (ahora.getTime() < ini) return false; // aún no empieza
    return visitas.some((v) => {
      const e = v.entrada.getTime();
      const s = (v.salida ?? ahora).getTime();
      const solape = (Math.min(fin, s) - Math.max(ini, e)) / 60_000;
      if (solape >= Math.min(minimo, (fin - ini) / 60_000)) return true;
      return v.salida == null && e <= ini + 15 * 60_000 && ahora.getTime() >= ini;
    });
  });
}
