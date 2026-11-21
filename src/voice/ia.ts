/**
 * PREPARADO PARA EL FUTURO (Fase 2 opcional): chat con IA usando la API de Claude.
 *
 * Todavía NO se usa. Queda listo el "enchufe":
 * - La API key se guarda cifrada con expo-secure-store (nunca en la base de datos
 *   ni en el código, y no entra en el respaldo JSON).
 * - `preguntarIA` es el punto donde, cuando el intérprete local devuelve
 *   'desconocido', se le podría pasar la pregunta + un resumen de tus datos a Claude.
 *
 * Para activarlo más adelante: implementar `preguntarIA` con fetch a
 * https://api.anthropic.com/v1/messages y llamarlo desde useAsistente
 * cuando la intención sea 'desconocido'.
 */
import * as SecureStore from 'expo-secure-store';

const CLAVE = 'tinzit0_anthropic_api_key';

export async function guardarApiKey(key: string) {
  await SecureStore.setItemAsync(CLAVE, key.trim());
}

export async function tieneApiKey(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(CLAVE));
}

export async function borrarApiKey() {
  await SecureStore.deleteItemAsync(CLAVE);
}

export type ContextoIA = { resumen: string };

/** Aún no implementado: devuelve null para que el asistente use su respuesta local. */
export async function preguntarIA(_pregunta: string, _contexto: ContextoIA): Promise<string | null> {
  return null;
}
