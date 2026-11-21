/**
 * Respaldo — la parte de la base de datos (sin archivos, para poder probarla en el computador).
 *
 * volcarDatos: lee TODAS las tablas en una sola transacción (una "foto" consistente, aunque la app
 *   esté escribiendo al mismo tiempo) y anota cuántas filas tiene cada tabla.
 * restaurarDatosSinFila: reemplaza todo en UNA transacción exclusiva. Si cualquier cosa falla,
 *   SQLite deshace todo y tus datos actuales quedan intactos. Al final revisa las relaciones entre
 *   tablas (integridad referencial) y repone los ajustes por defecto que un respaldo antiguo no trae.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { APP_ID, FORMATO, validarRespaldo, type ArchivoRespaldo, type Fila } from './respaldoFormato';
import { ajustesPorDefecto, tablasHastaVersion, VERSION_ESQUEMA } from './schema';
import { enExclusiva, transaccion } from './tx';

/** Tablas de la app (todas menos las internas de SQLite). */
export async function listarTablas(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rows.map((r) => r.name);
}

async function columnasDe(db: SQLiteDatabase, tabla: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${tabla}")`);
  return rows.map((r) => r.name);
}

/** Contexto para validar un respaldo contra esta versión de la app. */
export async function contextoValidacion(db: SQLiteDatabase) {
  return { versionActual: VERSION_ESQUEMA, tablasActuales: await listarTablas(db), tablasHastaVersion };
}

/** Lee todo en una transacción para que el respaldo sea una foto consistente. */
export async function volcarDatos(db: SQLiteDatabase, ahora = new Date()): Promise<ArchivoRespaldo> {
  return transaccion(db, async (tx) => {
    const version = (await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    const tables: Record<string, Fila[]> = {};
    const counts: Record<string, number> = {};
    for (const t of await listarTablas(tx)) {
      tables[t] = await tx.getAllAsync<Fila>(`SELECT * FROM "${t}"`);
      counts[t] = tables[t].length;
    }
    return { app: APP_ID, formato: FORMATO, schemaVersion: version, exportedAt: ahora.toISOString(), counts, tables };
  });
}

export type ResultadoRestauracion = { filas: number; omitidas: number };

/**
 * Reemplaza todos los datos por los del respaldo, de forma atómica.
 * OJO: no toma la fila exclusiva (quien llama debe hacerlo); usa restaurarDatos si no sabes.
 */
export async function restaurarDatosSinFila(db: SQLiteDatabase, crudo: ArchivoRespaldo): Promise<ResultadoRestauracion> {
  // Se valida otra vez aquí: nunca se borra nada con un respaldo que no pasó la revisión.
  const { data } = validarRespaldo(crudo, await contextoValidacion(db));

  return transaccion(db, async (tx) => {
    // Las relaciones se revisan al final (así el orden de borrado e inserción no importa).
    await tx.execAsync('PRAGMA defer_foreign_keys = ON');
    const tablas = await listarTablas(tx);
    for (const t of tablas) await tx.runAsync(`DELETE FROM "${t}"`);

    let filas = 0;
    for (const t of tablas) {
      const lista = data.tables[t];
      if (!lista?.length) continue;
      // Solo columnas que existen hoy (un respaldo antiguo puede no traer las nuevas: quedan con su valor por defecto).
      const cols = await columnasDe(tx, t);
      for (const fila of lista) {
        const usar = cols.filter((c) => c in fila);
        if (!usar.length) continue;
        await tx.runAsync(
          `INSERT INTO "${t}" (${usar.map((c) => `"${c}"`).join(', ')}) VALUES (${usar.map(() => '?').join(', ')})`,
          usar.map((c) => fila[c]),
        );
        filas++;
      }
    }

    // Ajustes que un respaldo antiguo no conoce (sin pisar los que sí trae).
    for (const sql of ajustesPorDefecto()) await tx.execAsync(sql);

    // Integridad referencial: filas que apuntan a algo que no existe (ej: series de un ejercicio borrado)
    // se quitan, para no dejar la base inconsistente.
    let omitidas = 0;
    for (let intento = 0; intento < 5; intento++) {
      const malas = await tx.getAllAsync<{ table: string; rowid: number | null }>('PRAGMA foreign_key_check');
      if (!malas.length) break;
      for (const m of malas) {
        if (m.rowid == null) continue;
        const r = await tx.runAsync(`DELETE FROM "${m.table}" WHERE rowid = ?`, m.rowid);
        omitidas += r.changes;
      }
    }
    const quedan = await tx.getAllAsync('PRAGMA foreign_key_check');
    if (quedan.length) throw new Error('El respaldo tiene datos que no calzan entre sí. No se cambió nada.');
    return { filas: filas - omitidas, omitidas };
  });
}

/** Restaura esperando su turno (no corre al mismo tiempo que avisos del banco, gastos fijos, etc.). */
export function restaurarDatos(db: SQLiteDatabase, data: ArchivoRespaldo): Promise<ResultadoRestauracion> {
  return enExclusiva(() => restaurarDatosSinFila(db, data));
}
