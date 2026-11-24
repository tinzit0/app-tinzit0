/**
 * Agenda de ramos: cálculos puros para dibujar el horario semanal como grilla
 * (probado en scripts/test-estudio.ts).
 */

export const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

type BloqueHorario = { id: number; weekday: number; start_time: string; end_time: string };

/** Desde qué hora hasta qué hora dibujar la grilla (horas enteras, con 8:00–18:00 como mínimo razonable). */
export function rangoHoras(bloques: BloqueHorario[]): { desde: number; hasta: number } {
  if (!bloques.length) return { desde: 8, hasta: 18 };
  const ini = Math.min(...bloques.map((b) => aMinutos(b.start_time)));
  const fin = Math.max(...bloques.map((b) => Math.max(aMinutos(b.end_time), aMinutos(b.start_time) + 30)));
  return { desde: Math.max(0, Math.min(8, Math.floor(ini / 60))), hasta: Math.min(24, Math.max(Math.ceil(fin / 60), Math.floor(ini / 60) + 4)) };
}

/**
 * Si dos bloques del mismo día se topan, se ponen lado a lado.
 * Devuelve para cada bloque su carril (0, 1…) y cuántos carriles tiene su grupo de topes.
 */
export function carriles<T extends BloqueHorario>(bloques: T[]): Map<number, { carril: number; de: number }> {
  const res = new Map<number, { carril: number; de: number }>();
  const porDia = new Map<number, T[]>();
  for (const b of bloques) porDia.set(b.weekday, [...(porDia.get(b.weekday) ?? []), b]);
  for (const lista of porDia.values()) {
    const orden = [...lista].sort((a, b) => aMinutos(a.start_time) - aMinutos(b.start_time) || aMinutos(a.end_time) - aMinutos(b.end_time));
    let grupo: { b: T; carril: number }[] = [];
    let finGrupo = -1;
    const cerrar = () => {
      const de = Math.max(1, ...grupo.map((g) => g.carril + 1));
      for (const g of grupo) res.set(g.b.id, { carril: g.carril, de });
      grupo = [];
    };
    for (const b of orden) {
      const ini = aMinutos(b.start_time);
      const fin = Math.max(aMinutos(b.end_time), ini + 1);
      if (grupo.length && ini >= finGrupo) cerrar();
      // Primer carril libre (cuyo último bloque ya terminó).
      const ocupados = new Set(grupo.filter((g) => Math.max(aMinutos(g.b.end_time), aMinutos(g.b.start_time) + 1) > ini).map((g) => g.carril));
      let c = 0;
      while (ocupados.has(c)) c++;
      grupo.push({ b, carril: c });
      finGrupo = Math.max(finGrupo, fin);
    }
    if (grupo.length) cerrar();
  }
  return res;
}

/** Días a mostrar en la semana: lunes a sábado, y domingo solo si hay clases ese día. */
export function diasDeLaSemana(bloques: BloqueHorario[]): number[] {
  const dias = [1, 2, 3, 4, 5, 6];
  if (bloques.some((b) => b.weekday === 7)) dias.push(7);
  return dias;
}
