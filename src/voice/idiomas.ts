/** Elegir el mejor español disponible (puro: se prueba en Node). */

/** Chile primero, después Latinoamérica, después cualquier español. Devuelve null si no hay. */
export function elegirEspanol(lista: string[]): string | null {
  const norm = lista.map((l) => l.replace('_', '-'));
  const pref = ['es-CL', 'es-419', 'es-US', 'es-MX', 'es-AR', 'es-ES'];
  for (const p of pref) {
    const hit = norm.find((l) => l.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  return norm.find((l) => /^es(-|$)/i.test(l)) ?? null;
}
