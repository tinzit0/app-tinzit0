/**
 * Posibles gastos repetidos (puro: se prueba en Node).
 * Pasa cuando anotas lo mismo dos veces: el aviso del banco + la boleta escaneada + a mano.
 * Regla: mismo monto, fechas a 1 día o menos, y que no lo hayas marcado como "no es repetido".
 * También exporta los gastos a CSV (para Excel o Google Sheets).
 */

export type GastoSimple = { id: number; amount: number; date: string; category: string; note: string | null };
export type ParDuplicado = { a: GastoSimple; b: GastoSimple };

const dia = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Clave estable de un par (el id menor primero). */
export const clavePar = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

export function buscarDuplicados(gastos: GastoSimple[], ignorados: Set<string> = new Set(), maxDias = 1): ParDuplicado[] {
  const porMonto = new Map<number, GastoSimple[]>();
  for (const g of gastos) {
    if (!(g.amount > 0)) continue;
    const l = porMonto.get(g.amount);
    if (l) l.push(g);
    else porMonto.set(g.amount, [g]);
  }
  const pares: ParDuplicado[] = [];
  const usados = new Set<number>(); // cada gasto aparece en un solo par (el más cercano)
  for (const lista of porMonto.values()) {
    if (lista.length < 2) continue;
    lista.sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id);
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i];
      if (usados.has(a.id)) continue;
      for (let j = i + 1; j < lista.length; j++) {
        const b = lista[j];
        if (usados.has(b.id)) continue;
        if (dia(b.date) - dia(a.date) > maxDias) break;
        if (ignorados.has(clavePar(a.id, b.id))) continue;
        pares.push({ a, b });
        usados.add(a.id);
        usados.add(b.id);
        break;
      }
    }
  }
  return pares.sort((x, y) => y.b.date.localeCompare(x.b.date));
}

/** Texto CSV (separado por ";" para Excel en español, con BOM para que lea bien las tildes). */
export function gastosACSV(gastos: GastoSimple[], etiqueta: (cat: string) => string = (c) => c): string {
  const celda = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = [['Fecha', 'Monto', 'Categoría', 'Nota'].join(';')];
  for (const g of gastos) filas.push([celda(g.date), celda(Math.round(g.amount)), celda(etiqueta(g.category)), celda(g.note)].join(';'));
  return '﻿' + filas.join('\r\n') + '\r\n';
}
