/**
 * Esquema de la base de datos (SQLite, guardada solo en tu celular).
 *
 * Cómo funcionan las "migraciones":
 * SQLite guarda un número de versión (PRAGMA user_version). Cada vez que
 * la app abre, revisa ese número y aplica solo los cambios que falten.
 * Así, cuando agreguemos cosas en fases futuras, NO se pierden tus datos.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

/** Lista ordenada de migraciones. Nunca se edita una ya publicada: se agrega una nueva. */
const MIGRATIONS: string[] = [
  // v1 — Estructura base para todos los módulos.
  `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  -- Tareas. Si repeat_type = 'none' se usa "done"; si se repite,
  -- cada día completado queda registrado en task_completions.
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    notes       TEXT,
    priority    TEXT NOT NULL DEFAULT 'media',   -- 'alta' | 'media' | 'baja'
    scope       TEXT NOT NULL DEFAULT 'diaria',  -- 'diaria' | 'semanal'
    due_date    TEXT,                            -- 'YYYY-MM-DD' o NULL
    repeat_type TEXT NOT NULL DEFAULT 'none',    -- 'none' | 'daily' | 'weekdays'
    repeat_days TEXT,                            -- ej: '1,3,5' (lunes=1 … domingo=7)
    done        INTEGER NOT NULL DEFAULT 0,
    done_at     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS task_completions (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date    TEXT NOT NULL,
    PRIMARY KEY (task_id, date)
  );

  -- Gastos en CLP (enteros, sin decimales).
  CREATE TABLE IF NOT EXISTS expenses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    amount     INTEGER NOT NULL,
    category   TEXT NOT NULL,
    note       TEXT,
    date       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

  -- Gym: qué toca cada día (lunes=1 … domingo=7). Sin fila = descanso.
  CREATE TABLE IF NOT EXISTS gym_routine (
    weekday INTEGER PRIMARY KEY NOT NULL,
    label   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL UNIQUE,
    muscle  TEXT
  );

  CREATE TABLE IF NOT EXISTS workout_sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    set_number  INTEGER NOT NULL,
    reps        INTEGER NOT NULL,
    weight      REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sets_ex_date ON workout_sets(exercise_id, date);

  -- Notas rápidas.
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    body       TEXT NOT NULL,
    pinned     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- Accesos directos a las apps que más usas.
  CREATE TABLE IF NOT EXISTS quick_apps (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    label    TEXT NOT NULL,
    url      TEXT NOT NULL,      -- esquema de la app, ej: 'whatsapp://'
    icon     TEXT NOT NULL,      -- nombre de ícono
    color    TEXT NOT NULL,      -- color del ícono
    position INTEGER NOT NULL DEFAULT 0
  );

  -- Valores iniciales de ajustes.
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('nombre', ''),
    ('presupuesto_semanal', '100000'),
    ('hora_manana', '08:00'),
    ('hora_noche', '21:30'),
    ('hora_domingo', '20:00');
  `,
];

/** Se llama una vez al abrir la app (desde SQLiteProvider en el _layout raíz). */
export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  // WAL = escritura más rápida; foreign_keys = borra en cascada lo relacionado.
  await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
