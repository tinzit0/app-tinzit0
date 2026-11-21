/**
 * Leer una boleta chilena a partir del texto que sacó el lector (OCR):
 * el TOTAL, el nombre del local y la fecha. Función pura (scripts/test-finanzas.ts).
 */
import { toISODate } from '@/utils/fechas';
import { categoriaDeComercio } from './banco';

export type Boleta = { monto: number | null; comercio: string | null; fecha: string; categoria: string };

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Montos de una línea: "$ 12.990", "12990", "12,990" (el OCR a veces cambia puntos por comas). */
function montosDe(linea: string): number[] {
  const out: number[] = [];
  const re = /\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d{2,7})(?![\d.,]*%)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(linea))) {
    const n = Number(m[1].replace(/[.,]/g, ''));
    if (Number.isFinite(n) && n >= 10 && n < 10_000_000) out.push(n);
  }
  return out;
}

const NO_TOTAL = /\b(sub ?total|neto|iva|exento|propina|vuelto|cambio|descuento|ahorro|items?|articulos?|cantidad|total items|total de articulos|efectivo|recibido)\b/;
const NO_COMERCIO = /\b(rut|r\.u\.t|boleta|electronica|factura|sii|giro|direccion|casa matriz|sucursal|fono|telefono|www|http|caja|cajero|vendedor|fecha|hora|folio|n[°º]|timbre|res\.?|resolucion)\b/;

export function leerBoleta(texto: string, hoy = new Date()): Boleta {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const norm = lineas.map(sinTildes);

  // --- Total: líneas con "total" (no subtotal/neto/iva); el número puede estar en la línea siguiente ---
  let monto: number | null = null;
  const candidatos: number[] = [];
  norm.forEach((l, k) => {
    if (!/\btotal\b|\ba pagar\b|\bmonto\b/.test(l) || NO_TOTAL.test(l)) return;
    const ms = montosDe(lineas[k]);
    if (ms.length) candidatos.push(ms[ms.length - 1]);
    else if (lineas[k + 1]) {
      const sig = montosDe(lineas[k + 1]);
      if (sig.length) candidatos.push(sig[0]);
    }
  });
  if (candidatos.length) monto = Math.max(...candidatos);
  else {
    // Sin "TOTAL" legible: el monto más grande con signo $
    const conPeso = lineas.filter((l) => l.includes('$')).flatMap(montosDe);
    if (conPeso.length) monto = Math.max(...conPeso);
  }

  // --- Comercio: la primera línea "de nombre" (letras, sin RUT, dirección, etc.) ---
  let comercio: string | null = null;
  for (let k = 0; k < Math.min(lineas.length, 6); k++) {
    const l = lineas[k];
    const letras = (l.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) ?? []).length;
    if (letras >= 3 && letras / l.length > 0.5 && !NO_COMERCIO.test(norm[k]) && !/\d{5,}/.test(l)) {
      comercio = l.replace(/\s{2,}/g, ' ').slice(0, 40);
      break;
    }
  }

  // --- Fecha: dd/mm/aaaa, dd-mm-aa, dd.mm.aaaa (si es válida y no futura) ---
  let fecha = toISODate(hoy);
  const f = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(texto);
  if (f) {
    const d = Number(f[1]);
    const mes = Number(f[2]);
    let a = Number(f[3]);
    if (a < 100) a += 2000;
    const dt = new Date(a, mes - 1, d);
    const haceUnAnio = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
    if (dt.getDate() === d && dt.getMonth() === mes - 1 && dt <= hoy && dt >= haceUnAnio) fecha = toISODate(dt);
  }

  return { monto, comercio, fecha, categoria: categoriaDeComercio(comercio ?? '', sinTildes(texto)) };
}
