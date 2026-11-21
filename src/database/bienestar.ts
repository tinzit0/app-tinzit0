/**
 * Datos de Bienestar: tarjeta diaria, sesiones de calma/impulsos, plan de crisis
 * y los datos de otros módulos (gym, estudio, gastos) para descubrir patrones.
 * Todo queda solo en el celular.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ClaveEmocion, DiaBienestar, TarjetaResumen } from '@/bienestar/logica';
import { toISODate } from '@/utils/fechas';
import { getSetting, setSetting } from './queries';

export type Tarjeta = TarjetaResumen;

type FilaTarjeta = {
  date: string;
  animo: number | null;
  emociones: string;
  impulso: number | null;
  actue: number;
  habilidades: string;
  sueno: number | null;
  nota: string | null;
};

function leerJSON<T>(s: string | null | undefined, porDefecto: T): T {
  try {
    return s ? (JSON.parse(s) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

const aTarjeta = (r: FilaTarjeta): Tarjeta => ({
  date: r.date,
  animo: r.animo,
  emociones: leerJSON<Partial<Record<ClaveEmocion, number>>>(r.emociones, {}),
  impulso: r.impulso,
  actue: !!r.actue,
  habilidades: leerJSON<string[]>(r.habilidades, []),
  sueno: r.sueno,
  nota: r.nota,
});

export async function obtenerTarjeta(db: SQLiteDatabase, fecha = toISODate()): Promise<Tarjeta | null> {
  const r = await db.getFirstAsync<FilaTarjeta>('SELECT * FROM diary_cards WHERE date = ?', fecha);
  return r ? aTarjeta(r) : null;
}

export async function guardarTarjeta(db: SQLiteDatabase, t: Tarjeta): Promise<void> {
  await db.runAsync(
    `INSERT INTO diary_cards (date, animo, emociones, impulso, actue, habilidades, sueno, nota, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(date) DO UPDATE SET animo = excluded.animo, emociones = excluded.emociones, impulso = excluded.impulso,
       actue = excluded.actue, habilidades = excluded.habilidades, sueno = excluded.sueno, nota = excluded.nota,
       updated_at = excluded.updated_at`,
    t.date,
    t.animo,
    JSON.stringify(t.emociones),
    t.impulso,
    t.actue ? 1 : 0,
    JSON.stringify(t.habilidades),
    t.sueno,
    t.nota?.trim() || null,
  );
}

/** Solo registra el ánimo de hoy (desde la tarjeta de Hoy o por voz), sin borrar lo demás. */
export async function registrarAnimo(db: SQLiteDatabase, animo: number, fecha = toISODate()): Promise<void> {
  await db.runAsync(
    `INSERT INTO diary_cards (date, animo) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET animo = excluded.animo, updated_at = datetime('now','localtime')`,
    fecha,
    Math.max(0, Math.min(10, Math.round(animo))),
  );
}

export async function listarTarjetas(db: SQLiteDatabase, desde: string, hasta: string): Promise<Tarjeta[]> {
  const rows = await db.getAllAsync<FilaTarjeta>('SELECT * FROM diary_cards WHERE date BETWEEN ? AND ? ORDER BY date', desde, hasta);
  return rows.map(aTarjeta);
}

// ---------- Calma e impulsos ----------

export async function registrarCalma(
  db: SQLiteDatabase,
  s: { tipo: 'calma' | 'impulso'; antes?: number | null; despues?: number | null; logrado?: boolean | null },
): Promise<void> {
  await db.runAsync(
    'INSERT INTO calm_sessions (date, tipo, antes, despues, logrado) VALUES (?, ?, ?, ?, ?)',
    toISODate(),
    s.tipo,
    s.antes ?? null,
    s.despues ?? null,
    s.logrado == null ? null : s.logrado ? 1 : 0,
  );
}

export async function contarImpulsos(db: SQLiteDatabase, desde = '0000-01-01', hasta = '9999-12-31'): Promise<{ total: number; logrados: number }> {
  const r = await db.getFirstAsync<{ total: number; logrados: number | null }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN logrado = 1 THEN 1 ELSE 0 END) AS logrados
     FROM calm_sessions WHERE tipo = 'impulso' AND logrado IS NOT NULL AND date BETWEEN ? AND ?`,
    desde,
    hasta,
  );
  return { total: r?.total ?? 0, logrados: r?.logrados ?? 0 };
}

/** Cuánto bajó la intensidad en promedio usando "Estoy a mil". */
export async function efectoCalma(db: SQLiteDatabase): Promise<{ veces: number; bajaPromedio: number | null }> {
  const r = await db.getFirstAsync<{ veces: number; baja: number | null }>(
    `SELECT COUNT(*) AS veces, AVG(antes - despues) AS baja FROM calm_sessions
     WHERE tipo = 'calma' AND antes IS NOT NULL AND despues IS NOT NULL`,
  );
  return { veces: r?.veces ?? 0, bajaPromedio: r?.baja ?? null };
}

// ---------- Datos cruzados para patrones ----------

/** Un día por fila con tu ánimo y lo que hiciste, para los últimos `n` días. */
export async function datosBienestar(db: SQLiteDatabase, n = 60, hoy = new Date()): Promise<DiaBienestar[]> {
  const hasta = toISODate(hoy);
  const desde = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (n - 1)));
  const [tarjetas, gym, estudio, gastos] = await Promise.all([
    listarTarjetas(db, desde, hasta),
    db.getAllAsync<{ date: string }>('SELECT DISTINCT date FROM workout_sets WHERE date BETWEEN ? AND ?', desde, hasta),
    db.getAllAsync<{ date: string; m: number }>('SELECT date, SUM(minutes) AS m FROM study_sessions WHERE date BETWEEN ? AND ? GROUP BY date', desde, hasta),
    db.getAllAsync<{ date: string; s: number }>('SELECT date, SUM(amount) AS s FROM expenses WHERE date BETWEEN ? AND ? GROUP BY date', desde, hasta),
  ]);
  const gymSet = new Set(gym.map((g) => g.date));
  const est = new Map(estudio.map((e) => [e.date, e.m]));
  const gas = new Map(gastos.map((g) => [g.date, g.s]));
  const tar = new Map(tarjetas.map((t) => [t.date, t]));
  const out: DiaBienestar[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const f = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - k));
    const t = tar.get(f);
    out.push({
      fecha: f,
      animo: t?.animo ?? null,
      impulso: t?.impulso ?? null,
      actue: t?.actue ?? false,
      sueno: t?.sueno ?? null,
      gym: gymSet.has(f),
      estudioMin: est.get(f) ?? 0,
      gasto: gas.get(f) ?? 0,
    });
  }
  return out;
}

// ---------- Plan de crisis ----------

export type Contacto = { nombre: string; telefono: string };
export type PlanCrisis = {
  senales: string[]; // cómo me doy cuenta de que se viene una crisis
  calma: string[]; // cosas que me ayudan a calmarme solo/a
  razones: string[]; // mis razones para seguir
  contactos: Contacto[]; // personas a quien llamar
};

export const PLAN_VACIO: PlanCrisis = { senales: [], calma: [], razones: [], contactos: [] };

export async function obtenerPlan(db: SQLiteDatabase): Promise<PlanCrisis> {
  const p = leerJSON<Partial<PlanCrisis>>(await getSetting(db, 'plan_crisis'), {});
  return {
    senales: p.senales ?? [],
    calma: p.calma ?? [],
    razones: p.razones ?? [],
    contactos: p.contactos ?? [],
  };
}

export async function guardarPlan(db: SQLiteDatabase, p: PlanCrisis): Promise<void> {
  const limpiar = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  await setSetting(
    db,
    'plan_crisis',
    JSON.stringify({
      senales: limpiar(p.senales),
      calma: limpiar(p.calma),
      razones: limpiar(p.razones),
      contactos: p.contactos.filter((c) => c.nombre.trim() && c.telefono.trim()).map((c) => ({ nombre: c.nombre.trim(), telefono: c.telefono.trim() })),
    }),
  );
}

/** Líneas de ayuda gratuitas en Chile. */
export const LINEAS_AYUDA: { nombre: string; detalle: string; telefono: string }[] = [
  { nombre: 'Línea de prevención del suicidio', detalle: '*4141 · gratis, 24 horas, desde cualquier celular', telefono: '*4141' },
  { nombre: 'Salud Responde', detalle: '600 360 7777 · apoyo y orientación en salud mental', telefono: '6003607777' },
  { nombre: 'SAMU (emergencias)', detalle: '131 · si estás en peligro ahora', telefono: '131' },
];
