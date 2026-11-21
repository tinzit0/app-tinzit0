/**
 * Respaldo: exportar e importar TODOS tus datos en un archivo JSON.
 *
 * Exportar (dos formas):
 * - "Guardar en una carpeta" (Android): eliges la carpeta, se escribe el archivo y se COMPRUEBA
 *   leyéndolo de vuelta. Solo entonces se anota la fecha del último respaldo.
 * - "Compartir": abre el menú de Android (Drive, WhatsApp, correo…). Como Android no avisa si de verdad
 *   se guardó, la app te pregunta y solo anota la fecha si confirmas.
 *
 * Importar:
 * - El archivo se revisa ENTERO antes de tocar nada (ver respaldoFormato.ts).
 * - Antes de reemplazar, se guarda una copia de tus datos actuales en el celular
 *   ("Recuperar datos de antes de importar" en Ajustes).
 * - El reemplazo es atómico: o queda todo el respaldo, o quedan tus datos como estaban.
 *
 * La parte de base de datos está en respaldoDatos.ts (probada en scripts/test-respaldo.ts).
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { toISODate } from '@/utils/fechas';
import { getSetting, setSetting } from './queries';
import { leerRespaldo, type ArchivoRespaldo, type ResumenRespaldo } from './respaldoFormato';
import { contextoValidacion, restaurarDatosSinFila, volcarDatos, type ResultadoRestauracion } from './respaldoDatos';
import { enExclusiva } from './tx';

export type { ArchivoRespaldo, ResumenRespaldo };

const COPIA_PREVIA = 'tinzit0-antes-de-importar.json';
const nombreArchivo = () => `tinzit0-respaldo-${toISODate()}.json`;

/** Marca que hiciste un respaldo hoy (solo cuando estamos seguros de que se guardó). */
export async function marcarRespaldoHecho(db: SQLiteDatabase): Promise<void> {
  await setSetting(db, 'ultimo_respaldo', toISODate());
}

/**
 * Android: eliges una carpeta y el respaldo se escribe ahí. Se lee de vuelta para comprobarlo.
 * Devuelve el nombre del archivo, o null si cancelaste.
 */
export async function guardarRespaldoEnCarpeta(db: SQLiteDatabase): Promise<string | null> {
  let carpeta: Directory;
  try {
    carpeta = await Directory.pickDirectoryAsync();
  } catch {
    return null; // cancelaste el selector
  }
  const texto = JSON.stringify(await volcarDatos(db));
  const nombre = nombreArchivo();
  const archivo = carpeta.createFile(nombre, 'application/json');
  await archivo.write(texto);
  const leido = await archivo.text();
  if (leido.length !== texto.length) throw new Error('El archivo no quedó completo. Prueba en otra carpeta.');
  await marcarRespaldoHecho(db);
  return nombre;
}

/**
 * Abre el menú "Compartir". NO anota la fecha: Android no avisa si de verdad se guardó.
 * Después de esto, la pantalla pregunta "¿Se guardó bien?" y llama a marcarRespaldoHecho.
 */
export async function compartirRespaldo(db: SQLiteDatabase): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartir no está disponible en este dispositivo.');
  const archivo = new File(Paths.cache, nombreArchivo());
  if (archivo.exists) archivo.delete();
  await archivo.write(JSON.stringify(await volcarDatos(db)));
  await Sharing.shareAsync(archivo.uri, { mimeType: 'application/json', dialogTitle: 'Guardar respaldo de Tinzit0' });
}

/**
 * Pide elegir un archivo de respaldo y lo revisa completo.
 * Devuelve null si cancelaste. Lanza un error entendible si el archivo no sirve.
 */
export async function elegirRespaldo(db: SQLiteDatabase): Promise<{ data: ArchivoRespaldo; resumen: ResumenRespaldo } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const texto = await new File(res.assets[0].uri).text();
  return leerRespaldo(texto, await contextoValidacion(db));
}

/** Guarda una copia de tus datos actuales en el celular (para poder deshacer una importación). */
async function guardarCopiaPrevia(db: SQLiteDatabase): Promise<void> {
  const texto = JSON.stringify(await volcarDatos(db));
  const archivo = new File(Paths.document, COPIA_PREVIA);
  if (archivo.exists) archivo.delete();
  await archivo.write(texto);
  if (!archivo.exists || (await archivo.text()).length !== texto.length) {
    throw new Error('No pude guardar una copia de tus datos actuales, así que no importé nada.');
  }
}

/**
 * Reemplaza todos tus datos por los del respaldo.
 * Primero guarda una copia de lo actual; si eso falla, no toca nada.
 */
export function restaurarRespaldo(db: SQLiteDatabase, data: ArchivoRespaldo): Promise<ResultadoRestauracion> {
  return enExclusiva(async () => {
    await guardarCopiaPrevia(db);
    return restaurarDatosSinFila(db, data);
  });
}

/** ¿Hay una copia de antes de la última importación? Devuelve su fecha o null. */
export function copiaPreviaDisponible(): string | null {
  try {
    const archivo = new File(Paths.document, COPIA_PREVIA);
    if (!archivo.exists) return null;
    const fecha = archivo.modificationTime ?? null;
    return fecha ? toISODate(new Date(fecha)) : '?';
  } catch {
    return null;
  }
}

/** Vuelve a los datos que tenías antes de la última importación (y guarda los de ahora como nueva copia). */
export function recuperarCopiaPrevia(db: SQLiteDatabase): Promise<ResultadoRestauracion> {
  return enExclusiva(async () => {
    const archivo = new File(Paths.document, COPIA_PREVIA);
    if (!archivo.exists) throw new Error('No hay una copia guardada.');
    const { data } = leerRespaldo(await archivo.text(), await contextoValidacion(db));
    await guardarCopiaPrevia(db);
    return restaurarDatosSinFila(db, data);
  });
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
