/**
 * Amigos y rachas en Supabase. Todo pasa por RLS: solo ves tus amistades, tus rachas
 * y los check-ins de tus amigos (nunca sus notas, gastos ni ahorros).
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './cliente';
import type { Perfil } from './cuenta';
import type { Actividad, Racha } from './logica';

function cliente() {
  if (!supabase) throw new Error('La cuenta en la nube no está configurada.');
  return supabase;
}

async function miId(): Promise<string> {
  const { data } = await cliente().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Inicia sesión para ver a tus amigos.');
  return id;
}

export type Amistad = { id: number; requester: string; addressee: string; status: 'pending' | 'accepted'; otro: Perfil };

/** Busca por usuario o código de amigo exacto. */
export async function buscarUsuario(q: string): Promise<Perfil | null> {
  const { data, error } = await cliente().rpc('buscar_usuario', { q });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : null) ?? null;
}

export async function pedirAmistad(otroId: string) {
  const yo = await miId();
  const { error } = await cliente().from('friendships').insert({ requester: yo, addressee: otroId });
  if (error) throw error;
}

export async function aceptarAmistad(id: number) {
  const { error } = await cliente().from('friendships').update({ status: 'accepted' }).eq('id', id);
  if (error) throw error;
}

/** Rechazar, cancelar o dejar de ser amigos. */
export async function borrarAmistad(id: number) {
  const { error } = await cliente().from('friendships').delete().eq('id', id);
  if (error) throw error;
}

export async function listarAmistades(): Promise<{ yo: string; amistades: Amistad[] }> {
  const s = cliente();
  const yo = await miId();
  const { data, error } = await s.from('friendships').select('id, requester, addressee, status').order('created_at', { ascending: false });
  if (error) throw error;
  const filas = (data ?? []) as Omit<Amistad, 'otro'>[];
  const ids = [...new Set(filas.map((f) => (f.requester === yo ? f.addressee : f.requester)))];
  if (!ids.length) return { yo, amistades: [] };
  const { data: perfiles, error: e2 } = await s.from('profiles').select('id, username, display_name, friend_code').in('id', ids);
  if (e2) throw e2;
  const mapa = new Map((perfiles as Perfil[]).map((p) => [p.id, p]));
  return {
    yo,
    amistades: filas
      .map((f) => ({ ...f, otro: mapa.get(f.requester === yo ? f.addressee : f.requester)! }))
      .filter((f) => !!f.otro),
  };
}

export async function listarRachas(): Promise<Racha[]> {
  const { data, error } = await cliente().from('streaks').select('id, user_a, user_b, activity, count, best, last_day').order('created_at');
  if (error) throw error;
  return (data ?? []) as Racha[];
}

export async function crearRacha(amigoId: string, actividad: Actividad) {
  const yo = await miId();
  const [user_a, user_b] = yo < amigoId ? [yo, amigoId] : [amigoId, yo];
  const { error } = await cliente().from('streaks').insert({ user_a, user_b, activity: actividad, created_by: yo });
  if (error) throw error;
}

export async function quitarRacha(id: number) {
  const { error } = await cliente().from('streaks').delete().eq('id', id);
  if (error) throw error;
}

/** Check-ins de un día (los tuyos y los de tus amigos). */
export async function checkinsDelDia(dia: string): Promise<{ user_id: string; activity: Actividad }[]> {
  const { data, error } = await cliente().from('checkins').select('user_id, activity').eq('day', dia);
  if (error) throw error;
  return (data ?? []) as { user_id: string; activity: Actividad }[];
}

/**
 * Tiempo real: avisa cuando cambian tus rachas, los check-ins o las solicitudes de amistad
 * (en ambos teléfonos al instante). Devuelve la función para dejar de escuchar.
 */
export function escucharCambios(alCambiar: () => void): () => void {
  const s = supabase;
  if (!s) return () => {};
  const canal: RealtimeChannel = s
    .channel(`amigos-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'streaks' }, alCambiar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, alCambiar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, alCambiar)
    .subscribe();
  return () => {
    s.removeChannel(canal).catch(() => {});
  };
}
