/**
 * Sincronización con la nube. La app SIEMPRE funciona local (SQLite); esto solo copia hacia Supabase:
 * - Check-ins del día (tareas / gym / agua) para las rachas. Si no hay internet, quedan en una cola
 *   (ajuste checkins_pendientes) y se suben cuando vuelve la conexión.
 * - Respaldo de tus datos (menos Bienestar y lo que se queda solo en el teléfono), máximo cada 10 min.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { cumplioMetaAgua } from '@/database/agua';
import { getSetting, setSetting } from '@/database/queries';
import { restaurarRespaldo } from '@/database/respaldo';
import { volcarDatos } from '@/database/respaldoDatos';
import type { ArchivoRespaldo } from '@/database/respaldoFormato';
import { tareasDelDia } from '@/database/tareas';
import { toISODate } from '@/utils/fechas';
import { supabase } from './cliente';
import { combinarConLocal, paraLaNube, type Actividad, type Racha } from './logica';

type Pendiente = { day: string; activity: Actividad };

async function sesionId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Qué actividades cumpliste en un día (según tus datos locales). */
export async function actividadesCumplidas(db: SQLiteDatabase, dia = toISODate()): Promise<Actividad[]> {
  const out: Actividad[] = [];
  const tareas = (await tareasDelDia(db, dia)).filter((t) => !t.atrasada);
  if (tareas.length > 0 && tareas.every((t) => t.hecha)) out.push('tareas');
  const gym = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM workout_sets WHERE date = ?', dia);
  if ((gym?.n ?? 0) > 0) out.push('gym');
  if (await cumplioMetaAgua(db, dia)) out.push('agua');
  return out;
}

const leerCola = (v: string | null): Pendiente[] => {
  try {
    const x = JSON.parse(v ?? '[]');
    return Array.isArray(x) ? x.filter((p) => p && typeof p.day === 'string' && ['tareas', 'gym', 'agua'].includes(p.activity)) : [];
  } catch {
    return [];
  }
};

/**
 * Registra en la nube lo que cumpliste hoy (y lo que quedó pendiente sin internet).
 * Los check-ins solo suman: si después desmarcas algo, el día ya contó (sin culpa).
 */
export async function subirCheckins(db: SQLiteDatabase): Promise<number> {
  const yo = await sesionId();
  if (!yo || !supabase) return 0;
  const hoy = toISODate();
  const ya = new Set((await getSetting(db, 'checkins_enviados_hoy'))?.startsWith(`${hoy}|`) ? (await getSetting(db, 'checkins_enviados_hoy'))!.split('|')[1].split(',') : []);
  const nuevos = (await actividadesCumplidas(db, hoy)).filter((a) => !ya.has(a)).map((a) => ({ day: hoy, activity: a }));
  // Solo sirven los de ayer en adelante (la base de datos no acepta días más viejos).
  const ayer = toISODate(new Date(Date.now() - 86400000));
  const cola = [...leerCola(await getSetting(db, 'checkins_pendientes')).filter((p) => p.day >= ayer), ...nuevos];
  if (!cola.length) return 0;
  const { error } = await supabase
    .from('checkins')
    .upsert(cola.map((p) => ({ user_id: yo, ...p })), { onConflict: 'user_id,day,activity', ignoreDuplicates: true });
  if (error) {
    // Sin internet (u otro problema): se guardan para la próxima.
    await setSetting(db, 'checkins_pendientes', JSON.stringify(cola.slice(-20)));
    return 0;
  }
  await setSetting(db, 'checkins_pendientes', '[]');
  const enviadosHoy = new Set([...ya, ...cola.filter((p) => p.day === hoy).map((p) => p.activity)]);
  await setSetting(db, 'checkins_enviados_hoy', `${hoy}|${[...enviadosHoy].join(',')}`);
  return cola.length;
}

/** Guarda las rachas para poder avisarte sin internet ("hoy pueden mantener la racha"). */
export async function guardarRachasCache(db: SQLiteDatabase, datos: { rachas: Racha[]; nombres: Record<string, string>; yo: string }) {
  await setSetting(db, 'rachas_cache', JSON.stringify(datos));
}

// ---------- Respaldo ----------

const DIEZ_MIN = 10 * 60 * 1000;

/** Sube tu respaldo (si pasó el tiempo mínimo o si `forzar`). Devuelve true si se subió. */
export async function subirRespaldo(db: SQLiteDatabase, forzar = false): Promise<boolean> {
  const yo = await sesionId();
  if (!yo || !supabase) return false;
  const ultimo = Number((await getSetting(db, 'nube_ultimo_respaldo')) ?? 0);
  if (!forzar && Date.now() - ultimo < DIEZ_MIN) return false;
  const archivo = paraLaNube(await volcarDatos(db));
  const { error } = await supabase.from('backups').upsert({
    user_id: yo,
    data: archivo,
    schema_version: archivo.schemaVersion,
    device: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 60),
    updated_at: new Date().toISOString(),
  });
  if (error) return false;
  await setSetting(db, 'nube_ultimo_respaldo', String(Date.now()));
  return true;
}

/** ¿Hay un respaldo tuyo en la nube? Devuelve su fecha. */
export async function infoRespaldoNube(): Promise<{ fecha: string; device: string | null } | null> {
  const yo = await sesionId();
  if (!yo || !supabase) return null;
  const { data, error } = await supabase.from('backups').select('updated_at, device').eq('user_id', yo).maybeSingle();
  if (error) throw error;
  return data ? { fecha: data.updated_at as string, device: (data.device as string | null) ?? null } : null;
}

/**
 * Reemplaza los datos del teléfono por los de la nube (lo que solo vive en el teléfono, como Bienestar, se mantiene).
 * Antes se guarda una copia local ("Recuperar datos de antes de importar" en Ajustes).
 */
export async function restaurarDesdeNube(db: SQLiteDatabase) {
  const yo = await sesionId();
  if (!yo || !supabase) throw new Error('Inicia sesión primero.');
  const { data, error } = await supabase.from('backups').select('data').eq('user_id', yo).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No tienes un respaldo en la nube todavía.');
  const combinado = combinarConLocal(data.data as ArchivoRespaldo, await volcarDatos(db));
  const r = await restaurarRespaldo(db, combinado);
  await setSetting(db, 'nube_ultimo_respaldo', String(Date.now()));
  return r;
}

/** Todo lo que se hace al abrir/cerrar la app con sesión iniciada (sin bloquear nada si falla). */
export async function sincronizarEnSegundoPlano(db: SQLiteDatabase) {
  if (!(await sesionId())) return;
  await subirCheckins(db).catch(() => 0);
  await subirRespaldo(db).catch(() => false);
}
