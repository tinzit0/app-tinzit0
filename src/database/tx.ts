/**
 * Herramientas para que las operaciones importantes queden "todo o nada".
 *
 * transaccion(db, fn)
 *   Corre fn en una transacción en una CONEXIÓN APARTE dedicada a escribir (BEGIN IMMEDIATE),
 *   así ninguna otra consulta de la app se mete al medio. Si algo falla, SQLite deshace todo.
 *   - Dentro de fn hay que usar SIEMPRE el `tx` que recibe, no el `db` de afuera.
 *   - No anidar: dentro de fn no se llama a otra función que use transaccion.
 *   - Esa conexión tiene las relaciones entre tablas activadas (foreign_keys) y espera hasta 5 s
 *     si otra conexión está escribiendo (busy_timeout), en vez de fallar al tiro.
 *   (No se usa withExclusiveTransactionAsync de expo-sqlite porque abre una conexión sin
 *   foreign_keys ni busy_timeout: los borrados en cascada no correrían.)
 *
 * enExclusiva(fn)
 *   Pone en fila las tareas de fondo que no deben correr al mismo tiempo
 *   (restaurar respaldo, avisos del banco, gastos fijos). Nunca anidar una dentro de otra.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

type Db = SQLiteDatabase;

/** En la web expo-sqlite no permite una segunda conexión: ahí usamos la transacción normal. */
const esWeb = typeof window !== 'undefined' && typeof (window as { document?: unknown }).document !== 'undefined';

let escritor: { ruta: string; conexion: Promise<Db> } | null = null;
let filaTx: Promise<unknown> = Promise.resolve();

/** Conexión dedicada a las transacciones (se abre una sola vez). */
function conexionEscritora(db: Db): Promise<Db> {
  const ruta = db.databasePath;
  if (escritor?.ruta === ruta) return escritor.conexion;
  // require dentro de la función: las pruebas en Node no cargan el módulo nativo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openDatabaseAsync } = require('expo-sqlite') as typeof import('expo-sqlite');
  const corte = ruta.lastIndexOf('/');
  const conexion = (async () => {
    const c = await openDatabaseAsync(ruta.slice(corte + 1), { useNewConnection: true }, ruta.slice(0, corte));
    await c.execAsync('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    return c;
  })();
  escritor = { ruta, conexion };
  conexion.catch(() => {
    if (escritor?.conexion === conexion) escritor = null;
  });
  return conexion;
}

async function correrEnConexion<T>(c: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  await c.execAsync('BEGIN IMMEDIATE');
  try {
    const r = await fn(c);
    await c.execAsync('COMMIT');
    return r;
  } catch (e) {
    try {
      await c.execAsync('ROLLBACK');
    } catch {
      // SQLite ya pudo haber deshecho la transacción; se conserva el error original.
    }
    throw e;
  }
}

export function transaccion<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  const tarea = async (): Promise<T> => {
    // Base de prueba (Node) o web: la transacción normal de esa base.
    if (esWeb || typeof db.databasePath !== 'string' || db.databasePath === ':memory:') {
      let r: T | undefined;
      await db.withTransactionAsync(async () => {
        r = await fn(db);
      });
      return r as T;
    }
    return correrEnConexion(await conexionEscritora(db), fn);
  };
  const r = filaTx.then(tarea, tarea);
  filaTx = r.catch(() => undefined);
  return r;
}

let fila: Promise<unknown> = Promise.resolve();

/** Ejecuta `fn` cuando terminen las tareas exclusivas anteriores (una a la vez). */
export function enExclusiva<T>(fn: () => Promise<T>): Promise<T> {
  const r = fila.then(fn, fn);
  fila = r.catch(() => undefined);
  return r;
}
