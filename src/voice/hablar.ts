/**
 * Voz del asistente (texto → voz) con expo-speech. Gratis: usa las voces del celular.
 * - Busca una voz en español latino (Chile, México, EE.UU. latino o "es-419").
 * - En Ajustes puedes elegir otra voz de las que tenga tu celular.
 * - El estilo "jarvis" habla un poco más grave y pausado.
 */
import * as Speech from 'expo-speech';

import { paraVoz } from './ejecutar';

const PREFERENCIA = ['es-CL', 'es-419', 'es-US', 'es-MX', 'es-AR', 'es-CO', 'es-ES'];

export type VozEs = { id: string; nombre: string; idioma: string };

let preferida: string | null = null;
let estilo: 'jarvis' | 'cercano' = 'jarvis';
let cache: { id?: string; lang: string } | null = null;

/** La pantalla le dice al módulo qué voz y estilo usar. */
export function configurarVoz(opc: { vozId?: string | null; estilo?: 'jarvis' | 'cercano' }) {
  if (opc.vozId !== undefined && opc.vozId !== preferida) {
    preferida = opc.vozId;
    cache = null;
  }
  if (opc.estilo) estilo = opc.estilo;
}

/** Voces en español disponibles en el celular. */
export async function vocesEspanol(): Promise<VozEs[]> {
  try {
    const voces = await Speech.getAvailableVoicesAsync();
    return voces
      .filter((v) => v.language.toLowerCase().startsWith('es'))
      .map((v) => ({ id: v.identifier, nombre: v.name || v.identifier, idioma: v.language.replace('_', '-') }))
      .sort((a, b) => {
        const pa = PREFERENCIA.findIndex((p) => a.idioma.toLowerCase() === p.toLowerCase());
        const pb = PREFERENCIA.findIndex((p) => b.idioma.toLowerCase() === p.toLowerCase());
        return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.nombre.localeCompare(b.nombre);
      });
  } catch {
    return [];
  }
}

async function elegirVoz() {
  if (cache) return cache;
  const voces = await vocesEspanol();
  const elegida = voces.find((v) => v.id === preferida) ?? voces[0];
  cache = elegida ? { id: elegida.id, lang: elegida.idioma } : { lang: 'es-US' };
  return cache;
}

/** Dice el texto en voz alta. La promesa termina cuando acaba de hablar. */
export async function hablar(texto: string): Promise<void> {
  const v = await elegirVoz();
  await Speech.stop();
  return new Promise((resolve) => {
    // Seguro: algunos motores de voz no avisan cuando terminan. Calculamos un
    // tiempo máximo según el largo del texto para no quedar esperando para siempre.
    const limite = setTimeout(resolve, 4000 + paraVoz(texto).length * 90);
    const listo = () => {
      clearTimeout(limite);
      resolve();
    };
    Speech.speak(paraVoz(texto), {
      language: v.lang,
      voice: v.id,
      rate: estilo === 'jarvis' ? 0.98 : 1.02,
      pitch: estilo === 'jarvis' ? 0.9 : 1.0,
      onDone: listo,
      onStopped: listo,
      onError: listo,
    });
  });
}

export function callar() {
  Speech.stop().catch(() => {});
}

export async function estaHablando() {
  return Speech.isSpeakingAsync().catch(() => false);
}
