/**
 * Entender los avisos de compra que mandan las apps de los bancos chilenos.
 * Funciones puras: se prueban en scripts/test-finanzas.ts.
 *
 * Ejemplos que entiende:
 *   "Compra por $5.990 en LIDER EXPRESS con tu tarjeta terminada en 1234"
 *   "Compraste $12.500 en UBER *TRIP"
 *   "Se realizó un cargo de $8.990 en NETFLIX.COM"
 *   "Pagaste $3.200 en COPEC con tu CuentaRUT"
 * Ignora: abonos, depósitos, transferencias recibidas, claves, promociones y pagos de tu tarjeta.
 */
import { detectarCategoria } from '@/voice/interpretar';

/** Partes del nombre de paquete de las apps de bancos/billeteras chilenas que escuchamos. */
export const PAQUETES_BANCO = [
  'bancoestado', 'bech', 'cuentarut', 'falabella', 'cmr', 'fpay', 'santander', 'bci', 'bancochile', 'bancodechile',
  'itau', 'scotiabank', 'tenpo', 'mercadopago', 'machbank', 'mach', 'bice', 'security', 'ripley', 'consorcio', 'coopeuch',
];

export type AvisoBanco = { pkg: string; title: string; text: string; ts: number };

export type ResultadoAviso =
  | { tipo: 'compra'; monto: number; comercio: string | null; categoria: string }
  | { tipo: 'transferencia'; monto: number; comercio: string | null; categoria: string }
  | { tipo: 'ignorar'; motivo: string };

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "$5.990" / "$ 12.500" / "CLP 8990" / "$1.234,50" → número entero de pesos. */
export function leerMonto(texto: string): number | null {
  const m = /(?:\$|clp|monto(?: de)?:?)\s*\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?/i.exec(texto);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  return Number.isFinite(n) && n > 0 && n < 50_000_000 ? n : null;
}

/** Nombre del comercio: lo que viene después de "en" (o "comercio:"). */
export function leerComercio(texto: string): string | null {
  const t = texto.replace(/\s+/g, ' ');
  const m =
    /(?:comercio|establecimiento)\s*:?\s*([^\n,.;]{2,40})/i.exec(t) ??
    /\$\s*[\d.,]+\s+(?:en|a)\s+(?:el comercio\s+)?([A-Za-z0-9ÁÉÍÓÚÑáéíóúñ*][^,;\n]{1,40}?)(?=\s+(?:con|el|por|a las|desde|mediante|usando|terminada|tarjeta)\b|[.,;](?:\s|$)|$)/i.exec(t) ??
    /\ben\s+([A-ZÁÉÍÓÚÑ0-9*][A-ZÁÉÍÓÚÑ0-9*.&' -]{1,40}?)(?=\s+(?:con|el|por|a las|desde|tarjeta)\b|[.,;](?:\s|$)|$)/.exec(t);
  if (!m) return null;
  const c = m[1].trim().replace(/\s{2,}/g, ' ').replace(/[*]+$/, '').trim();
  if (!c || /^(tu|su|la|el|cuenta|tarjeta|linea)\b/i.test(c)) return null;
  return c.length > 40 ? c.slice(0, 40) : c;
}

const IGNORAR = /\b(abono|abonamos|deposito|depositaron|recibiste|te (transfirieron|enviaron|depositaron)|transferencia recibida|codigo|clave|contrasena|otp|token|inicio de sesion|iniciaste sesion|ingreso a tu|oferta|promo|descuento exclusivo|cyber|aprobado|preaprobado|credito de consumo|avance|pago (de|a) tu tarjeta|pagaste tu tarjeta|pago recibido|pago de tu (estado de cuenta|tarjeta)|rechazad[a-z]*|no fue (aprobada|realizada)|anulad[a-z]*|reversa|devolucion|reembolso|cashback|puntos|cmr puntos|vence|vencimiento|recuerda)\b/;
const COMPRA = /\b(compra|compraste|cargo|cargamos|pagaste|pago (con|en)|transaccion|se realizo (una|un) (compra|pago|cargo)|utilizaste tu|uso de tu tarjeta|realizaste una compra|giro|retiraste)\b/;
const TRANSFER = /\b(transferiste|transferencia (realizada|enviada|exitosa)|enviaste)\b/;

export function interpretarAviso(a: Pick<AvisoBanco, 'title' | 'text'>): ResultadoAviso {
  const completo = `${a.title ?? ''}. ${a.text ?? ''}`;
  const n = sinTildes(completo);
  if (IGNORAR.test(n)) return { tipo: 'ignorar', motivo: 'no es un gasto' };
  const monto = leerMonto(completo);
  if (!monto) return { tipo: 'ignorar', motivo: 'sin monto' };
  const comercio = leerComercio(a.text ?? '') ?? leerComercio(completo);
  const categoria = categoriaDeComercio(comercio ?? '', n);
  if (TRANSFER.test(n)) return { tipo: 'transferencia', monto, comercio, categoria: 'otros' };
  if (COMPRA.test(n)) return { tipo: 'compra', monto, comercio, categoria };
  return { tipo: 'ignorar', motivo: 'no parece compra' };
}

/** Categoría por el nombre del comercio (supermercados, bencineras, apps de transporte…). */
export function categoriaDeComercio(comercio: string, contexto = ''): string {
  const c = sinTildes(comercio);
  const porComercio = detectarCategoria(c);
  if (porComercio !== 'otros') return porComercio;
  return contexto ? detectarCategoria(sinTildes(contexto)) : 'otros';
}

/** ¿Esta app es de un banco que escuchamos? */
export function esAppDeBanco(pkg: string): boolean {
  const p = pkg.toLowerCase();
  return PAQUETES_BANCO.some((x) => p.includes(x));
}

/** Nombre bonito del banco según el paquete. */
export function nombreBanco(pkg: string): string {
  const p = pkg.toLowerCase();
  if (/bancoestado|bech|cuentarut/.test(p)) return 'BancoEstado';
  if (/falabella|cmr|fpay/.test(p)) return 'Falabella';
  if (/santander/.test(p)) return 'Santander';
  if (/bci/.test(p)) return 'BCI';
  if (/bancochile|bancodechile/.test(p)) return 'Banco de Chile';
  if (/tenpo/.test(p)) return 'Tenpo';
  if (/mercadopago/.test(p)) return 'Mercado Pago';
  if (/mach/.test(p)) return 'MACH';
  return 'Banco';
}
