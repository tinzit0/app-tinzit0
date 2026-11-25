/**
 * Conexión con Supabase (cuentas, amigos, rachas y respaldo en la nube).
 * Las claves vienen del archivo .env (EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY).
 * Si no están, `supabase` es null y la app funciona igual que siempre, solo que sin cuenta.
 * OJO: aquí va SOLO la anon key (pública, protegida por RLS). Nunca la service_role.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const URL_SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const nubeConfigurada = /^https:\/\/[\w-]+\.supabase\.co\/?$/.test(URL_SUPABASE) && ANON_KEY.length > 20;

export const supabase: SupabaseClient | null = nubeConfigurada
  ? createClient(URL_SUPABASE, ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// La sesión se renueva sola solo mientras la app está abierta (así no gasta batería en segundo plano).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Mensajes de error de Supabase en español y sin tecnicismos. */
export function errorAmable(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)).toLowerCase();
  if (m.includes('invalid login credentials')) return 'El correo o la contraseña no coinciden.';
  if (m.includes('email not confirmed')) return 'Falta confirmar tu correo: revisa tu bandeja (y spam) y toca el enlace.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene cuenta. Prueba iniciar sesión.';
  if (m.includes('password should be') || m.includes('weak password')) return 'La contraseña es muy corta: usa al menos 8 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muchos intentos seguidos. Espera un ratito y vuelve a intentar.';
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to')) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  if (m.includes('duplicate') || m.includes('unique')) return 'Eso ya existe.';
  return 'Algo falló. Inténtalo de nuevo en un rato.';
}
