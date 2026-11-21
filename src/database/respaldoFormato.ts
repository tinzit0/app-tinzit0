/**
 * Formato y validación de los respaldos (sin dependencias de Expo, para poder probarlo).
 *
 * Un respaldo se revisa ENTERO antes de tocar tus datos:
 * - que sea de Tinzit0 y de una versión que esta app entiende (los de versiones más nuevas se rechazan);
 * - que traiga todas las tablas que existían en su versión (si falta alguna, está incompleto);
 * - que cada fila sea un objeto con valores simples (texto, número, vacío);
 * - que la cantidad de filas calce con la que se anotó al exportar (si el archivo se cortó, se nota).
 * Los respaldos antiguos se aceptan: las tablas nuevas quedan vacías y se ponen los ajustes por defecto.
 */

export const APP_ID = 'tinzit0';
/** Versión del formato del archivo (no confundir con la versión del esquema de la base). */
export const FORMATO = 2;

export type Valor = string | number | null;
export type Fila = Record<string, Valor>;

export type ArchivoRespaldo = {
  app: string;
  formato?: number;
  schemaVersion: number;
  exportedAt: string;
  /** Cuántas filas tenía cada tabla al exportar (desde el formato 2). */
  counts?: Record<string, number>;
  tables: Record<string, Fila[]>;
};

export type ResumenRespaldo = {
  tablas: number;
  filas: number;
  fecha: string;
  schemaVersion: number;
  /** Tablas que esta app tiene pero el respaldo no (por ser antiguo): quedarán vacías. */
  tablasNuevasVacias: string[];
  /** Tablas del respaldo que esta app no conoce: se ignoran. */
  tablasDesconocidas: string[];
};

export class RespaldoInvalido extends Error {}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Revisa el contenido de un respaldo. Devuelve los datos limpios (booleanos → 0/1) y un resumen,
 * o lanza RespaldoInvalido con un mensaje entendible.
 */
export function validarRespaldo(
  crudo: unknown,
  ctx: { versionActual: number; tablasActuales: string[]; tablasHastaVersion: (v: number) => string[] },
): { data: ArchivoRespaldo; resumen: ResumenRespaldo } {
  if (!esObjeto(crudo) || crudo.app !== APP_ID) throw new RespaldoInvalido('Ese archivo no es un respaldo de Tinzit0.');
  const v = crudo.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new RespaldoInvalido('El respaldo no indica su versión: no se puede restaurar con seguridad.');
  if (v > ctx.versionActual) {
    throw new RespaldoInvalido('Este respaldo es de una versión más nueva de Tinzit0. Actualiza la app y vuelve a intentarlo.');
  }
  if (typeof crudo.formato === 'number' && crudo.formato > FORMATO) {
    throw new RespaldoInvalido('Este respaldo usa un formato más nuevo. Actualiza la app y vuelve a intentarlo.');
  }
  if (!esObjeto(crudo.tables)) throw new RespaldoInvalido('El respaldo no trae datos.');

  const esperadas = ctx.tablasHastaVersion(v);
  const faltan = esperadas.filter((t) => !Array.isArray((crudo.tables as Record<string, unknown>)[t]));
  if (faltan.length) {
    throw new RespaldoInvalido(`El respaldo está incompleto (faltan: ${faltan.slice(0, 4).join(', ')}${faltan.length > 4 ? '…' : ''}). No se tocaron tus datos.`);
  }

  const counts = esObjeto(crudo.counts) ? (crudo.counts as Record<string, unknown>) : null;
  const tables: Record<string, Fila[]> = {};
  let filas = 0;
  for (const [t, lista] of Object.entries(crudo.tables)) {
    if (!/^\w+$/.test(t)) throw new RespaldoInvalido(`Nombre de tabla no válido en el respaldo: "${t.slice(0, 30)}".`);
    if (!Array.isArray(lista)) throw new RespaldoInvalido(`La tabla "${t}" del respaldo está dañada.`);
    if (counts && typeof counts[t] === 'number' && counts[t] !== lista.length) {
      throw new RespaldoInvalido(`El respaldo está cortado: "${t}" debería tener ${counts[t]} filas y tiene ${lista.length}. No se tocaron tus datos.`);
    }
    const limpias: Fila[] = [];
    for (const [k, fila] of lista.entries()) {
      if (!esObjeto(fila)) throw new RespaldoInvalido(`La fila ${k + 1} de "${t}" está dañada.`);
      const limpia: Fila = {};
      for (const [col, val] of Object.entries(fila)) {
        if (!/^\w+$/.test(col)) throw new RespaldoInvalido(`Columna no válida en "${t}".`);
        if (val === null || typeof val === 'string') limpia[col] = val;
        else if (typeof val === 'number' && Number.isFinite(val)) limpia[col] = val;
        else if (typeof val === 'boolean') limpia[col] = val ? 1 : 0;
        else throw new RespaldoInvalido(`Hay un valor no válido en "${t}" (fila ${k + 1}, ${col}).`);
      }
      limpias.push(limpia);
    }
    tables[t] = limpias;
    filas += limpias.length;
  }
  // También deben venir todas las tablas que el respaldo dice haber contado.
  if (counts) {
    const perdidas = Object.keys(counts).filter((t) => !(t in tables));
    if (perdidas.length) throw new RespaldoInvalido(`El respaldo está cortado (falta "${perdidas[0]}"). No se tocaron tus datos.`);
  }

  const data: ArchivoRespaldo = {
    app: APP_ID,
    formato: typeof crudo.formato === 'number' ? crudo.formato : 1,
    schemaVersion: v,
    exportedAt: typeof crudo.exportedAt === 'string' ? crudo.exportedAt : '',
    counts: counts ? (Object.fromEntries(Object.entries(counts).filter(([, n]) => typeof n === 'number')) as Record<string, number>) : undefined,
    tables,
  };
  return {
    data,
    resumen: {
      tablas: Object.keys(tables).length,
      filas,
      fecha: data.exportedAt.slice(0, 10) || '?',
      schemaVersion: v,
      tablasNuevasVacias: ctx.tablasActuales.filter((t) => !(t in tables)),
      tablasDesconocidas: Object.keys(tables).filter((t) => !ctx.tablasActuales.includes(t)),
    },
  };
}

/** Lee el texto de un archivo y lo valida. */
export function leerRespaldo(texto: string, ctx: Parameters<typeof validarRespaldo>[1]) {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new RespaldoInvalido('Ese archivo no es un respaldo válido (está dañado o no es JSON).');
  }
  return validarRespaldo(crudo, ctx);
}
