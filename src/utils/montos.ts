/**
 * Convierte montos "a la chilena" en números.
 * Sirve para el formulario y, más adelante, para el asistente de voz.
 *
 *   "5000"        → 5000
 *   "5.000"       → 5000
 *   "5 lucas"     → 5000
 *   "una luca"    → 1000
 *   "cinco mil"   → 5000
 *   "2 palos"     → 2000000
 *   "15 mil 500"  → 15500
 */

const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200,
  trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700,
  ochocientos: 800, novecientos: 900, media: 0.5, medio: 0.5,
};

const MULTIPLICADORES: Record<string, number> = {
  mil: 1000, luca: 1000, lucas: 1000, lukas: 1000, luka: 1000, k: 1000,
  palo: 1_000_000, palos: 1_000_000, millon: 1_000_000, millones: 1_000_000,
};

/** Quita tildes y pasa a minúsculas. */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Devuelve el monto en pesos, o null si no se encontró ningún monto. */
export function parseMonto(texto: string): number | null {
  const s = normalizar(texto)
    .replace(/\$/g, ' ')
    .replace(/(\d)\.(?=\d{3}\b)/g, '$1') // 5.000 → 5000
    .replace(/(\d),(\d)/g, '$1.$2') // 1,5 → 1.5
    .replace(/(\d)(k|mil|lucas?|lukas?)\b/g, '$1 $2'); // 5k → 5 k

  const tokens = s.split(/[\s-]+/).filter(Boolean);
  let total = 0;
  let actual = 0;
  let encontrado = false;
  let ultimoMult = 0;

  for (const [i, tok] of tokens.entries()) {
    // "un"/"una" solo es número si viene antes de "mil", "luca", "palo"… ("un gasto" no es 1).
    if ((tok === 'un' || tok === 'una' || tok === 'uno') && !(tokens[i + 1] in MULTIPLICADORES)) {
      if (encontrado) break;
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(tok)) {
      actual += Number(tok);
      encontrado = true;
    } else if ((tok === 'media' || tok === 'medio') && ultimoMult > 0 && actual === 0) {
      // "luca y media" = 1.500
      total += ultimoMult / 2;
    } else if (tok in NUMEROS) {
      actual += NUMEROS[tok];
      encontrado = true;
    } else if (tok in MULTIPLICADORES) {
      // "luca" sola = 1 luca
      total += (actual || 1) * MULTIPLICADORES[tok];
      ultimoMult = MULTIPLICADORES[tok];
      actual = 0;
      encontrado = true;
    } else if (tok === 'y' || tok === 'de' || tok === 'pesos' || tok === 'peso') {
      continue;
    } else if (encontrado) {
      // Una palabra cualquiera después del monto: el monto terminó.
      break;
    }
  }

  if (!encontrado) return null;
  const r = Math.round(total + actual);
  return r > 0 ? r : null;
}

/** Deja solo dígitos (para el campo de monto mientras escribes). */
export function soloDigitos(s: string): string {
  return s.replace(/\D/g, '').replace(/^0+/, '');
}
