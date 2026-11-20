/**
 * Logros y medallas.
 * Cada logro tiene una condición que se revisa con tus datos. Cuando se cumple
 * por primera vez, se guarda la fecha y la app lo celebra con una animación.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { endOfWeek, startOfWeek, toISODate } from '@/utils/fechas';
import { listarHabitos } from './habitos';
import { getSetting } from './queries';

export type Logro = {
  key: string;
  titulo: string;
  descripcion: string;
  icon: string; // Ionicons
  color: string;
  grupo: 'Tareas' | 'Gym' | 'Plata' | 'Hábitos' | 'Otros';
  /** Devuelve true si ya se cumple. */
  cumple: (c: Contexto) => boolean;
};

/** Números que necesitan los logros, calculados una sola vez por revisión. */
type Contexto = {
  tareasHechas: number;
  diasGym: number;
  rachaGym: number;
  semanasBajoPresupuestoSeguidas: number;
  mejorRachaHabito: number;
  metaLograda: boolean;
  totalAhorrado: number;
  notas: number;
  respaldo: boolean;
  medicionesCuerpo: number;
};

export const LOGROS: Logro[] = [
  { key: 'tarea_1', grupo: 'Tareas', titulo: 'Primer check', descripcion: 'Completa tu primera tarea', icon: 'checkmark-circle', color: '#CFF56B', cumple: (c) => c.tareasHechas >= 1 },
  { key: 'tarea_30', grupo: 'Tareas', titulo: 'Máquina', descripcion: 'Completa 30 tareas', icon: 'flash', color: '#FACC15', cumple: (c) => c.tareasHechas >= 30 },
  { key: 'tarea_100', grupo: 'Tareas', titulo: 'Imparable', descripcion: 'Completa 100 tareas', icon: 'rocket', color: '#F97316', cumple: (c) => c.tareasHechas >= 100 },
  { key: 'gym_1', grupo: 'Gym', titulo: 'Primer día', descripcion: 'Registra tu primer entrenamiento', icon: 'barbell', color: '#38BDF8', cumple: (c) => c.diasGym >= 1 },
  { key: 'gym_racha_7', grupo: 'Gym', titulo: 'Semana de fierro', descripcion: '7 días seguidos de gym', icon: 'flame', color: '#EF4444', cumple: (c) => c.rachaGym >= 7 },
  { key: 'gym_50', grupo: 'Gym', titulo: 'Rata de gym', descripcion: '50 días entrenados', icon: 'trophy', color: '#F59E0B', cumple: (c) => c.diasGym >= 50 },
  { key: 'cuerpo_1', grupo: 'Gym', titulo: 'Punto de partida', descripcion: 'Registra tu peso por primera vez', icon: 'body', color: '#2DD4BF', cumple: (c) => c.medicionesCuerpo >= 1 },
  { key: 'presupuesto_1', grupo: 'Plata', titulo: 'Bolsillo sano', descripcion: 'Una semana sin pasarte del presupuesto', icon: 'wallet', color: '#34D399', cumple: (c) => c.semanasBajoPresupuestoSeguidas >= 1 },
  { key: 'presupuesto_4', grupo: 'Plata', titulo: 'Mes ordenado', descripcion: '4 semanas seguidas dentro del presupuesto', icon: 'shield-checkmark', color: '#10B981', cumple: (c) => c.semanasBajoPresupuestoSeguidas >= 4 },
  { key: 'meta_1', grupo: 'Plata', titulo: 'Meta cumplida', descripcion: 'Completa una meta de ahorro', icon: 'flag', color: '#A78BFA', cumple: (c) => c.metaLograda },
  { key: 'ahorro_100k', grupo: 'Plata', titulo: 'Cien lucas', descripcion: 'Junta $100.000 en tus metas', icon: 'cash', color: '#22C55E', cumple: (c) => c.totalAhorrado >= 100000 },
  { key: 'habito_7', grupo: 'Hábitos', titulo: 'Agarrando ritmo', descripcion: 'Racha de 7 días en un hábito', icon: 'leaf', color: '#84CC16', cumple: (c) => c.mejorRachaHabito >= 7 },
  { key: 'habito_14', grupo: 'Hábitos', titulo: 'Dos semanas firmes', descripcion: 'Racha de 14 días en un hábito', icon: 'medal', color: '#EAB308', cumple: (c) => c.mejorRachaHabito >= 14 },
  { key: 'habito_30', grupo: 'Hábitos', titulo: 'Hábito de verdad', descripcion: 'Racha de 30 días en un hábito', icon: 'ribbon', color: '#F472B6', cumple: (c) => c.mejorRachaHabito >= 30 },
  { key: 'notas_10', grupo: 'Otros', titulo: 'Cabeza ordenada', descripcion: 'Escribe 10 notas', icon: 'document-text', color: '#94A3B8', cumple: (c) => c.notas >= 10 },
  { key: 'respaldo_1', grupo: 'Otros', titulo: 'Precavido', descripcion: 'Haz tu primer respaldo', icon: 'cloud-done', color: '#60A5FA', cumple: (c) => c.respaldo },
];

async function n(db: SQLiteDatabase, sql: string, ...params: (string | number)[]) {
  return (await db.getFirstAsync<{ n: number }>(sql, ...params))?.n ?? 0;
}

function sumarDias(iso: string, d: number) {
  const [y, m, day] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, day + d));
}

async function contexto(db: SQLiteDatabase): Promise<Contexto> {
  const tareasHechas =
    (await n(db, `SELECT COUNT(*) AS n FROM tasks WHERE repeat_type = 'none' AND done = 1`)) +
    (await n(db, 'SELECT COUNT(*) AS n FROM task_completions'));

  // Gym: días distintos y la racha más larga de días seguidos.
  const dias = (await db.getAllAsync<{ date: string }>('SELECT DISTINCT date FROM workout_sets ORDER BY date')).map((r) => r.date);
  let rachaGym = 0;
  let actual = 0;
  for (let i = 0; i < dias.length; i++) {
    actual = i > 0 && sumarDias(dias[i - 1], 1) === dias[i] ? actual + 1 : 1;
    rachaGym = Math.max(rachaGym, actual);
  }

  // Presupuesto: semanas ya terminadas (de la más reciente hacia atrás) dentro del límite.
  const presupuesto = Number((await getSetting(db, 'presupuesto_semanal')) ?? 0);
  let semanas = 0;
  if (presupuesto > 0) {
    const lunes = startOfWeek();
    for (let i = 1; i <= 12; i++) {
      const ini = new Date(lunes);
      ini.setDate(lunes.getDate() - 7 * i);
      const desde = toISODate(ini);
      const hasta = toISODate(endOfWeek(ini));
      const cant = await n(db, 'SELECT COUNT(*) AS n FROM expenses WHERE date BETWEEN ? AND ?', desde, hasta);
      if (cant === 0) break; // semana sin registros: no cuenta
      const total = await n(db, 'SELECT COALESCE(SUM(amount), 0) AS n FROM expenses WHERE date BETWEEN ? AND ?', desde, hasta);
      if (total > presupuesto) break;
      semanas++;
    }
  }

  const habitos = await listarHabitos(db);
  const metas = await db.getAllAsync<{ target: number; ahorrado: number }>(
    `SELECT g.target, COALESCE((SELECT SUM(amount) FROM goal_contributions c WHERE c.goal_id = g.id), 0) AS ahorrado FROM savings_goals g`,
  );

  return {
    tareasHechas,
    diasGym: dias.length,
    rachaGym,
    semanasBajoPresupuestoSeguidas: semanas,
    mejorRachaHabito: habitos.reduce((m, h) => Math.max(m, h.mejorRacha), 0),
    metaLograda: metas.some((m) => m.ahorrado >= m.target),
    totalAhorrado: metas.reduce((s, m) => s + Math.max(0, m.ahorrado), 0),
    notas: await n(db, 'SELECT COUNT(*) AS n FROM notes'),
    respaldo: !!(await getSetting(db, 'ultimo_respaldo')),
    medicionesCuerpo: await n(db, 'SELECT COUNT(*) AS n FROM body_metrics'),
  };
}

/** Revisa todos los logros y guarda los nuevos. Devuelve los recién desbloqueados. */
export async function evaluarLogros(db: SQLiteDatabase): Promise<Logro[]> {
  const c = await contexto(db);
  const ya = new Set((await db.getAllAsync<{ key: string }>('SELECT key FROM achievements')).map((r) => r.key));
  const nuevos: Logro[] = [];
  for (const l of LOGROS) {
    if (!ya.has(l.key) && l.cumple(c)) {
      await db.runAsync(
        `INSERT OR IGNORE INTO achievements (key, unlocked_at, seen) VALUES (?, datetime('now','localtime'), 0)`,
        l.key,
      );
      nuevos.push(l);
    }
  }
  return nuevos;
}

/** Logros desbloqueados que aún no has visto (para celebrarlos). */
export async function logrosSinVer(db: SQLiteDatabase): Promise<Logro[]> {
  const rows = await db.getAllAsync<{ key: string }>('SELECT key FROM achievements WHERE seen = 0 ORDER BY unlocked_at');
  return rows.map((r) => LOGROS.find((l) => l.key === r.key)).filter(Boolean) as Logro[];
}

export async function marcarVisto(db: SQLiteDatabase, key: string) {
  await db.runAsync('UPDATE achievements SET seen = 1 WHERE key = ?', key);
}

export async function desbloqueados(db: SQLiteDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ key: string; unlocked_at: string }>('SELECT key, unlocked_at FROM achievements');
  return new Map(rows.map((r) => [r.key, r.unlocked_at]));
}
