/**
 * Widget de la pantalla de inicio: conexión con la app.
 *
 * - actualizarWidget(db): la app lo llama al abrir/salir, así el widget
 *   muestra tus datos al día.
 * - registrarWidget(): se llama en el arranque (index.ts). Android también
 *   pide actualizar el widget cada 30 minutos; ahí abrimos la base de datos
 *   "en segundo plano" y lo redibujamos.
 */
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDb } from '@/database/schema';
import { datosWidget } from './datos';
import { widgetLib } from './lib';
import { ResumenWidget } from './ResumenWidget';

export const NOMBRE_WIDGET = 'Resumen';

export async function actualizarWidget(db: SQLiteDatabase) {
  const lib = widgetLib();
  if (!lib) return;
  try {
    const d = await datosWidget(db);
    await lib.requestWidgetUpdate({
      widgetName: NOMBRE_WIDGET,
      renderWidget: () => <ResumenWidget d={d} />,
      widgetNotFound: () => {},
    });
  } catch (e) {
    console.warn('No se pudo actualizar el widget', e);
  }
}

export function registrarWidget() {
  const lib = widgetLib();
  if (!lib) return;
  lib.registerWidgetTaskHandler(async ({ widgetAction, renderWidget }) => {
    if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
    const db = await SQLite.openDatabaseAsync('tinzit0.db');
    await migrateDb(db);
    renderWidget(<ResumenWidget d={await datosWidget(db)} />);
  });
}
