/**
 * Cuenta en Supabase: registrarse, iniciar y cerrar sesión, recuperar contraseña y tu perfil.
 */
import * as Linking from 'expo-linking';

import { supabase } from './cliente';

export type Perfil = { id: string; username: string; display_name: string | null; friend_code: string };

function cliente() {
  if (!supabase) throw new Error('La cuenta en la nube no está configurada (falta el archivo .env).');
  return supabase;
}

export async function usuarioDisponible(usuario: string): Promise<boolean> {
  const { data, error } = await cliente().rpc('usuario_disponible', { u: usuario });
  if (error) throw error;
  return data === true;
}

/** Crea la cuenta. Devuelve true si ya quedó con sesión (si Supabase pide confirmar el correo, es false). */
export async function registrarse(correo: string, contrasena: string, usuario: string, nombre: string): Promise<boolean> {
  const { data, error } = await cliente().auth.signUp({
    email: correo.trim(),
    password: contrasena,
    options: { data: { username: usuario, display_name: nombre.trim() || null } },
  });
  if (error) throw error;
  return !!data.session;
}

export async function iniciarSesion(correo: string, contrasena: string) {
  const { error } = await cliente().auth.signInWithPassword({ email: correo.trim(), password: contrasena });
  if (error) throw error;
}

export async function cerrarSesion() {
  const { error } = await cliente().auth.signOut();
  if (error) throw error;
}

/** Manda un correo con un enlace que abre la app en la pantalla para poner una contraseña nueva. */
export async function recuperarContrasena(correo: string) {
  const { error } = await cliente().auth.resetPasswordForEmail(correo.trim(), { redirectTo: Linking.createURL('recuperar') });
  if (error) throw error;
}

/** El enlace del correo trae la sesión en la URL (#access_token=…&refresh_token=…). */
export async function sesionDesdeEnlace(url: string): Promise<boolean> {
  const frag = url.includes('#') ? url.split('#')[1] : (url.split('?')[1] ?? '');
  const p = new URLSearchParams(frag);
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (!access_token || !refresh_token) return false;
  const { error } = await cliente().auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return true;
}

export async function cambiarContrasena(nueva: string) {
  const { error } = await cliente().auth.updateUser({ password: nueva });
  if (error) throw error;
}

export async function miPerfil(): Promise<Perfil | null> {
  const s = cliente();
  const { data: u } = await s.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await s.from('profiles').select('id, username, display_name, friend_code').eq('id', u.user.id).maybeSingle();
  if (error) throw error;
  return data as Perfil | null;
}

export async function cambiarNombre(nombre: string) {
  const s = cliente();
  const { data: u } = await s.auth.getUser();
  if (!u.user) return;
  const { error } = await s.from('profiles').update({ display_name: nombre.trim() || null }).eq('id', u.user.id);
  if (error) throw error;
}
