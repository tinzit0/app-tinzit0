/**
 * Respaldo: exportar e importar TODOS tus datos en un archivo JSON.
 *
 * - Exportar: lee cada tabla de la base de datos, arma un JSON y abre el
 *   menú "Compartir" de Android (lo puedes guardar en Drive, mandar por
 *   WhatsApp, correo, etc.).
 * - Importar: eliges el archivo y se REEMPLAZAN todos los datos actuales.
 *
 * Funciona con cualquier tabla nueva que agreguemos en el futuro, porque
 * lee la lista de tablas directamente de la base de datos.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { toISODate } from '@/utils/fechas';
import { getSetting, setSetting } from './queries';

const APP_ID = 'tinzit0';

type ArchivoRespaldo = {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};

/** Tablas de la app (todas menos las internas de SQLite). */
async function listarTablas(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rows.map((r) => r.name);
}

async function columnasDe(db: SQLiteDatabase, tabla: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${tabla}")`);
  return rows.map((r) => r.name);
}

/** Crea el archivo de respaldo y abre el menú para compartirlo/guardarlo. */
export async function exportarRespaldo(db: SQLiteDatabase): Promise<void> {
  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  const tables: ArchivoRespaldo['tables'] = {};
  for (const t of await listarTablas(db)) {
    tables[t] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${t}"`);
  }
  const data: ArchivoRespaldo = {
    app: APP_ID,
    schemaVersion: version,
    exportedAt: new Date().toISOString(),
    tables,
  };

  const archivo = new File(Paths.cache, `tinzit0-respaldo-${toISODate()}.json`);
  if (archivo.exists) archivo.delete();
  await archivo.write(JSON.stringify(data));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartir no está disponible en este dispositivo.');
  }
  await Sharing.shareAsync(archivo.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Guardar respaldo de Tinzit0',
  });
  await setSetting(db, 'ultimo_respaldo', toISODate());
}

export type ResumenImport = { tablas: number; filas: number; fecha: string };

/**
 * Pide elegir un archivo de respaldo y lo valida.
 * Devuelve null si cancelaste. Lanza un error si el archivo no sirve.
 */
export async function elegirRespaldo(): Promise<{ data: ArchivoRespaldo; resumen: ResumenImport } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;

  const texto = await new File(res.assets[0].uri).text();
  let data: ArchivoRespaldo;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error('Ese archivo no es un respaldo válido (no es JSON).');
  }
  if (data?.app !== APP_ID || typeof data.tables !== 'object') {
    throw new Error('Ese archivo no es un respaldo de Tinzit0.');
  }
  const filas = Object.values(data.tables).reduce((n, rows) => n + (rows?.length ?? 0), 0);
  return {
    data,
    resumen: { tablas: Object.keys(data.tables).length, filas, fecha: data.exportedAt?.slice(0, 10) ?? '?' },
  };
}

/**
 * Reemplaza todos los datos por los del respaldo.
 * Todo ocurre en una transacción: si algo falla, no se pierde nada.
 */
export async function restaurarRespaldo(db: SQLiteDatabase, data: ArchivoRespaldo): Promise<void> {
  const tablasActuales = await listarTablas(db);
  await db.execAsync('PRAGMA foreign_keys = OFF');
  try {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const t of tablasActuales) {
        await tx.runAsync(`DELETE FROM "${t}"`);
      }
      for (const t of tablasActuales) {
        const filas = data.tables[t];
        if (!Array.isArray(filas) || filas.length === 0) continue;
        // Solo insertamos columnas que existen hoy (por si el respaldo es de otra versión).
        const cols = await columnasDe(tx, t);
        for (const fila of filas) {
          const usar = cols.filter((c) => c in fila);
          if (usar.length === 0) continue;
          const placeholders = usar.map(() => '?').join(', ');
          const valores = usar.map((c) => fila[c] as string | number | null);
          await tx.runAsync(
            `INSERT OR REPLACE INTO "${t}" (${usar.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
            valores,
          );
        }
      }
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON');
  }
  await setSetting(db, 'ultimo_respaldo', toISODate());
}

/** ¿Hace más de 7 días (o nunca) que no respaldas, y ya tienes datos que cuidar? */
export async function necesitaRespaldo(db: SQLiteDatabase): Promise<boolean> {
  const ultimo = await getSetting(db, 'ultimo_respaldo');
  if (ultimo) {
    const dias = (Date.now() - new Date(`${ultimo}T00:00:00`).getTime()) / 86400000;
    return dias >= 7;
  }
  // Nunca has respaldado: avisamos solo si ya hay datos y la app tiene más de 3 días de uso.
  const r = await db.getFirstAsync<{ n: number; primero: string | null }>(
    `SELECT
       (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM expenses) + (SELECT COUNT(*) FROM workout_sets) + (SELECT COUNT(*) FROM notes) AS n,
       (SELECT MIN(created_at) FROM tasks) AS primero`,
  );
  if (!r || r.n < 5) return false;
  if (!r.primero) return true;
  return (Date.now() - new Date(r.primero.replace(' ', 'T')).getTime()) / 86400000 >= 3;
}
