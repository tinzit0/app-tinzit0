/**
 * Órdenes para música (Spotify) y para hacer cosas DENTRO de otras apps:
 *   "pon Bad Bunny en Spotify", "pausa la música", "siguiente canción",
 *   "busca recetas de pan en YouTube", "llévame al Mall Plaza",
 *   "manda un WhatsApp que diga voy en camino", "llama al 912345678".
 * Funciones puras: se prueban en scripts/test-voz.ts.
 */
export type IntencionApps =
  | { tipo: 'musica_reproducir'; consulta: string }
  | { tipo: 'musica_control'; accion: 'pausa' | 'continuar' | 'siguiente' | 'anterior' }
  | { tipo: 'musica_sonando' }
  | { tipo: 'app_accion'; accion: 'youtube' | 'google' | 'navegar' | 'mapa' | 'whatsapp' | 'llamar'; texto: string };

/** Destinos que son pantallas de Tinzit0 (no lugares del mapa). */
const PANTALLAS = /^(mis |la |el |los |las |mi )?(gastos?|tareas?|gym|notas?|habitos?|metas?|fijos|clima|estadisticas|medallas|logros|ajustes|rutina|peso|cuerpo|apps|hoy|inicio|historial|configuracion)\b/;

const limpiar = (s: string) => s.replace(/\s+por favor$/, '').replace(/\s+/g, ' ').trim();

export function reglasApps(t: string): IntencionApps | null {
  // --- YouTube ---
  const yt = /^(?:busca(?:me)?|pon(?:me)?|reproduce|muestrame|abre)\s+(?:un video de\s+|videos de\s+|el video de\s+)?(.+?)\s+en\s+youtube$/.exec(t);
  if (yt) return { tipo: 'app_accion', accion: 'youtube', texto: limpiar(yt[1]) };

  // --- Google ---
  const g = /^(?:busca(?:me)?|googlea|investiga)\s+(.+?)\s+en\s+(?:google|internet|la web)$/.exec(t) ?? /^(?:busca(?:me)? en (?:google|internet)|googlea)\s+(.+)$/.exec(t);
  if (g) return { tipo: 'app_accion', accion: 'google', texto: limpiar(g[1]) };

  // --- Navegación / mapas ---
  const nav = /^(?:llevame|llevarme|navega|navegar|como llego|como me voy|ruta|indicaciones)\s+(?:a|al|a la|hacia|hasta|para)\s+(.+)$/.exec(t);
  if (nav && !PANTALLAS.test(nav[1])) return { tipo: 'app_accion', accion: 'navegar', texto: limpiar(nav[1]) };
  const mapa = /^(?:busca(?:me)?|muestrame)\s+(.+?)\s+en\s+(?:el\s+)?(?:maps|mapa|google maps)$/.exec(t) ?? /^donde (?:queda|esta ubicad[oa])\s+(.+)$/.exec(t);
  if (mapa && !PANTALLAS.test(mapa[1])) return { tipo: 'app_accion', accion: 'mapa', texto: limpiar(mapa[1]) };

  // --- WhatsApp ---
  const wsp = /^(?:manda(?:le)?|envia(?:le)?|escribe(?:le)?)\s+(?:un\s+)?(?:whatsapp|wsp|wasap|guasap|mensaje(?: por whatsapp)?)\s*(?:a\s+[a-z ]+?\s+)?(?:diciendo|que diga|que dice|que|con el texto)\s+(.+)$/.exec(t);
  if (wsp) return { tipo: 'app_accion', accion: 'whatsapp', texto: limpiar(wsp[1]) };

  // --- Llamar a un número ---
  const tel = /^(?:llama|llamar|marca)\s+(?:al|a)\s+((?:\+?\d[\d ]{6,}))$/.exec(t);
  if (tel) return { tipo: 'app_accion', accion: 'llamar', texto: tel[1].replace(/\s+/g, '') };

  // --- Música: controles ---
  if (/^(pausa|pausar|deten|para|detener|silencia|calla)(\s+(la\s+)?(musica|cancion|spotify|el tema))?$/.test(t)) return { tipo: 'musica_control', accion: 'pausa' };
  if (/^(sigue|reanuda|continua|play|dale play)(\s+(la\s+)?(musica|cancion|spotify))?$/.test(t)) return { tipo: 'musica_control', accion: 'continuar' };
  if (/^(siguiente|salta|saltate|pasa|cambia)(\s+(la\s+)?(cancion|tema|tema siguiente))?$|^siguiente cancion$|^otra cancion$/.test(t)) return { tipo: 'musica_control', accion: 'siguiente' };
  if (/^(anterior|cancion anterior|vuelve a la (cancion )?anterior|la de antes|tema anterior)$/.test(t)) return { tipo: 'musica_control', accion: 'anterior' };
  if (/\b(que (cancion|tema) (es|suena|esta sonando)|que esta sonando|como se llama (esta|la) cancion|que suena)\b/.test(t)) return { tipo: 'musica_sonando' };

  // --- Música: reproducir ---
  const mus =
    /^(?:pon(?:me)?|reproduce|reproducir|toca|quiero escuchar|escuchar|play)\s+(.+?)\s+en\s+spotify$/.exec(t) ??
    /^(?:reproduce|reproducir|quiero escuchar|toca)\s+(.+)$/.exec(t) ??
    /^(?:pon(?:me)?)\s+((?:musica|canciones|una cancion|la cancion|el tema|la playlist|el album|algo)\b.*)$/.exec(t);
  if (mus) {
    const consulta = limpiar(mus[1].replace(/^(musica de|canciones de|la cancion|el tema|la playlist|el album|algo de)\s+/, ''));
    if (consulta && !/\b(temporizador|descanso|alarma|recordatorio|tarea|nota)\b/.test(consulta)) return { tipo: 'musica_reproducir', consulta };
  }
  return null;
}

/** "pon X" sin pista de música: se usa SOLO si nada más entendió la frase. */
export function musicaPorDescarte(t: string): IntencionApps | null {
  const m = /^(?:pon(?:me)?|ponte)\s+(.+)$/.exec(t);
  if (!m) return null;
  if (/\b(temporizador|descanso|alarma|recordatorio|tarea|nota|rojo|azul|verde|morado|cian|lima|naranjo|dorado|blanco|rosado|modo|tema|color|presupuesto)\b/.test(m[1])) return null;
  return { tipo: 'musica_reproducir', consulta: limpiar(m[1]) };
}
