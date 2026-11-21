/**
 * Configuración de la IA: API key (guardada cifrada) y si está activada.
 * Este archivo NO carga el SDK de Anthropic, así se puede usar en Ajustes y
 * al abrir el chat sin cargar nada pesado.
 */
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from '@/database/queries';

const CLAVE = 'tinzit0_anthropic_api_key';

export async function guardarApiKey(key: string) {
  await SecureStore.setItemAsync(CLAVE, key.trim());
}

export async function tieneApiKey(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(CLAVE).catch(() => null));
}

export async function borrarApiKey() {
  await SecureStore.deleteItemAsync(CLAVE);
}

export async function iaActivada(db: SQLiteDatabase): Promise<boolean> {
  return (await getSetting(db, 'ia_activada')) === '1' && (await tieneApiKey());
}

export async function cambiarIaActivada(db: SQLiteDatabase, v: boolean) {
  await setSetting(db, 'ia_activada', v ? '1' : '0');
}


/** Solo la usa ia.ts para llamar a la API. */
export async function leerApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(CLAVE).catch(() => null);
}
