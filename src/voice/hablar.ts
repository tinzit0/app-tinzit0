/**
 * Voz de Tinzit0 (texto → voz) con expo-speech.
 * Busca una voz en español latino (Chile, México, EE.UU. latino o "es-419").
 * Si no encuentra, usa el español que tenga el celular.
 */
import * as Speech from 'expo-speech';

import { paraVoz } from './ejecutar';

const PREFERENCIA = ['es-CL', 'es-419', 'es-US', 'es-MX', 'es-AR', 'es-CO'];
let vozElegida: { id?: string; lang: string } | null = null;

async function elegirVoz() {
  if (vozElegida) return vozElegida;
  try {
    const voces = await Speech.getAvailableVoicesAsync();
    const norm = (l: string) => l.replace('_', '-');
    for (const lang of PREFERENCIA) {
      const v = voces.find((x) => norm(x.language).toLowerCase() === lang.toLowerCase());
      if (v) return (vozElegida = { id: v.identifier, lang });
    }
    const cualquiera = voces.find((x) => x.language.toLowerCase().startsWith('es'));
    vozElegida = cualquiera ? { id: cualquiera.identifier, lang: norm(cualquiera.language) } : { lang: 'es-US' };
  } catch {
    vozElegida = { lang: 'es-US' };
  }
  return vozElegida;
}

/** Dice el texto en voz alta. La promesa termina cuando acaba de hablar. */
export async function hablar(texto: string): Promise<void> {
  const v = await elegirVoz();
  await Speech.stop();
  return new Promise((resolve) => {
    Speech.speak(paraVoz(texto), {
      language: v.lang,
      voice: v.id,
      rate: 1.02,
      pitch: 1.0,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export function callar() {
  Speech.stop().catch(() => {});
}
