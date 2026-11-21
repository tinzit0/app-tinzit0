/**
 * Leer texto de una foto (apuntes, pizarra, guías) DENTRO del celular: gratis y sin internet
 * (solo se descarga el modelo la primera vez, ~45 MB).
 *
 * Usa el OCR de React Native ExecuTorch con el alfabeto latino en español.
 * Si la librería no está (Expo Go, web), `ocrSoportado()` es false y la pantalla lo explica.
 */
import { Platform } from 'react-native';

type Legacy = typeof import('react-native-executorch/legacy');
type Modulo = Awaited<ReturnType<Legacy['OCRModule']['fromModelName']>>;
type Deteccion = { bbox: { x1: number; y1: number; x2: number; y2: number }; text: string; score: number };

let lib: Legacy | null | undefined;
function cargar(): Legacy | null {
  if (lib !== undefined) return lib;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return (lib = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = require('react-native-executorch/legacy') as Legacy;
  } catch {
    lib = null;
  }
  return lib;
}

export function ocrSoportado() {
  return cargar() !== null;
}

let modulo: Modulo | null = null;
let cargando: Promise<Modulo> | null = null;

async function obtener(onProgreso?: (p: number) => void): Promise<Modulo> {
  if (modulo) return modulo;
  if (cargando) return cargando;
  const l = cargar();
  if (!l) throw new Error('El lector de texto no está disponible en esta versión de la app.');
  cargando = l.OCRModule.fromModelName(l.OCR_SPANISH, (p) => onProgreso?.(p > 1 ? p / 100 : p));
  try {
    modulo = await cargando;
    return modulo;
  } finally {
    cargando = null;
  }
}

export function liberarOCR() {
  try {
    modulo?.delete();
  } catch {
    // ya liberado
  }
  modulo = null;
}

/**
 * Ordena lo detectado como se lee: de arriba hacia abajo y, en cada renglón, de izquierda a derecha.
 * (Exportada para probarla.)
 */
export function ordenarRenglones(dets: Deteccion[]): string {
  const validas = dets.filter((d) => d.text.trim() && d.score >= 0.2);
  if (!validas.length) return '';
  const alturaMedia = validas.reduce((s, d) => s + (d.bbox.y2 - d.bbox.y1), 0) / validas.length;
  const ordenadas = [...validas].sort((a, b) => (a.bbox.y1 + a.bbox.y2) / 2 - (b.bbox.y1 + b.bbox.y2) / 2);
  const renglones: Deteccion[][] = [];
  for (const d of ordenadas) {
    const cy = (d.bbox.y1 + d.bbox.y2) / 2;
    const ultimo = renglones[renglones.length - 1];
    const cyUltimo = ultimo ? ultimo.reduce((s, x) => s + (x.bbox.y1 + x.bbox.y2) / 2, 0) / ultimo.length : null;
    if (ultimo && cyUltimo != null && Math.abs(cy - cyUltimo) < alturaMedia * 0.6) ultimo.push(d);
    else renglones.push([d]);
  }
  return renglones.map((r) => r.sort((a, b) => a.bbox.x1 - b.bbox.x1).map((d) => d.text.trim()).join(' ')).join('\n');
}

/** Lee el texto de una imagen (uri file://…). */
export async function leerTextoDeImagen(uri: string, onProgreso?: (p: number) => void): Promise<string> {
  const m = await obtener(onProgreso);
  const dets = (await m.forward(uri)) as Deteccion[];
  return ordenarRenglones(dets);
}
