/**
 * Tus apps favoritas (para abrirlas rápido desde Hoy).
 * Se guarda el paquete de Android en la columna "url" como "pkg:com.whatsapp".
 */
import * as IntentLauncher from 'expo-intent-launcher';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Linking, Platform } from 'react-native';

import { CATALOGO_APPS, type AppCatalogo } from '@/utils/apps';

export type AppFavorita = AppCatalogo & { id: number };

export async function listarApps(db: SQLiteDatabase): Promise<AppFavorita[]> {
  const rows = await db.getAllAsync<{ id: number; label: string; url: string; icon: string; color: string }>(
    'SELECT * FROM quick_apps ORDER BY position, id',
  );
  return rows.map((r) => {
    const pkg = r.url.replace(/^pkg:/, '');
    const cat = CATALOGO_APPS.find((a) => a.pkg === pkg);
    return { id: r.id, pkg, label: r.label, icon: r.icon, color: r.color, scheme: cat?.scheme };
  });
}

/** Guarda la lista completa (en el orden elegido). */
export async function guardarApps(db: SQLiteDatabase, apps: AppCatalogo[]) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM quick_apps');
    for (const [i, a] of apps.entries()) {
      await db.runAsync(
        'INSERT INTO quick_apps (label, url, icon, color, position) VALUES (?, ?, ?, ?, ?)',
        a.label,
        `pkg:${a.pkg}`,
        a.icon,
        a.color,
        i,
      );
    }
  });
}

/** Si nunca elegiste apps, te dejamos unas de partida. */
export async function appsIniciales(db: SQLiteDatabase) {
  const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM quick_apps');
  if ((n?.n ?? 0) > 0) return;
  const base = ['com.whatsapp', 'com.instagram.android', 'com.spotify.music', 'com.google.android.youtube'];
  await guardarApps(db, CATALOGO_APPS.filter((a) => base.includes(a.pkg)));
}

/**
 * Abre la app:
 * 1. por su paquete de Android,
 * 2. si no se puede, por su enlace propio (ej: whatsapp://),
 * 3. si tampoco, abre su página en Google Play.
 */
export async function abrirApp(pkg: string) {
  if (Platform.OS !== 'android') return;
  try {
    IntentLauncher.openApplication(pkg);
    return;
  } catch {
    // seguimos con el plan B
  }
  const scheme = CATALOGO_APPS.find((a) => a.pkg === pkg)?.scheme;
  if (scheme) {
    try {
      await Linking.openURL(scheme);
      return;
    } catch {
      // seguimos con el plan C
    }
  }
  await Linking.openURL(`market://details?id=${pkg}`).catch(() =>
    Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`),
  );
}

/** Ícono real de la app instalada (como imagen). null si no se puede. */
const cacheIconos = new Map<string, string | null>();
export async function iconoReal(pkg: string): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  if (cacheIconos.has(pkg)) return cacheIconos.get(pkg)!;
  try {
    const b64 = await IntentLauncher.getApplicationIconAsync(pkg);
    const uri = b64 ? (b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`) : null;
    cacheIconos.set(pkg, uri);
    return uri;
  } catch {
    cacheIconos.set(pkg, null);
    return null;
  }
}
