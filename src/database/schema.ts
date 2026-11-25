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

  // v2 — Gastos fijos mensuales y metas de ahorro.
  `
  CREATE TABLE IF NOT EXISTS fixed_expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    amount       INTEGER NOT NULL,
    category     TEXT NOT NULL DEFAULT 'suscripciones',
    day_of_month INTEGER NOT NULL,              -- 1..31 (si el mes es más corto, se usa el último día)
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  -- Registro de qué gastos fijos ya se sumaron cada mes (para no duplicar).
  CREATE TABLE IF NOT EXISTS fixed_payments (
    fixed_id   INTEGER NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
    month      TEXT NOT NULL,                   -- 'YYYY-MM'
    expense_id INTEGER,
    PRIMARY KEY (fixed_id, month)
  );

  CREATE TABLE IF NOT EXISTS savings_goals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    target     INTEGER NOT NULL,
    deadline   TEXT,                            -- 'YYYY-MM-DD' o NULL
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS goal_contributions (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    amount  INTEGER NOT NULL,                   -- puede ser negativo (retiro)
    date    TEXT NOT NULL
  );
  `,

  // v3 — Peso corporal y medidas (en kg y cm). Cada campo es opcional.
  `
  CREATE TABLE IF NOT EXISTS body_metrics (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    date   TEXT NOT NULL,
    weight REAL,
    chest  REAL,
    arm    REAL,
    waist  REAL,
    leg    REAL
  );
  CREATE INDEX IF NOT EXISTS idx_body_date ON body_metrics(date);
  INSERT OR IGNORE INTO settings (key, value) VALUES ('descanso_seg', '90');
  `,

  // v4 — Hábitos (con registro diario) y logros desbloqueados.
  `
  CREATE TABLE IF NOT EXISTS habits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT 'checkmark',
    color      TEXT NOT NULL DEFAULT '#CFF56B',
    archived   INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date     TEXT NOT NULL,
    PRIMARY KEY (habit_id, date)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    key         TEXT PRIMARY KEY NOT NULL,
    unlocked_at TEXT NOT NULL,
    seen        INTEGER NOT NULL DEFAULT 0
  );
  `,

  // v5 — Historial del asistente de voz.
  `
  CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL,              -- 'user' | 'bot'
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES ('escucha_activa', '0'), ('voz_respuesta', '1');
  `,

  // v6 — Lo que el asistente aprende: tu frase → el comando que significa.
  `
  CREATE TABLE IF NOT EXISTS voice_learned (
    frase   TEXT PRIMARY KEY NOT NULL,   -- normalizada (minúsculas, sin tildes)
    comando TEXT NOT NULL,               -- frase que el intérprete entiende
    usos    INTEGER NOT NULL DEFAULT 0
  );
  `,

  // v7 — Modo Estudiante: ramos, horario, evaluaciones (notas 1.0–7.0), asistencia,
  // sesiones de estudio (pomodoro) y tarjetas de memoria con repetición espaciada.
  `
  CREATE TABLE IF NOT EXISTS courses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    color          TEXT NOT NULL DEFAULT '#CFF56B',
    teacher        TEXT,
    room           TEXT,
    passing        REAL NOT NULL DEFAULT 4.0,     -- nota para aprobar
    min_attendance INTEGER NOT NULL DEFAULT 75,   -- % de asistencia mínima
    archived       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS class_blocks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    weekday    INTEGER NOT NULL,                  -- 1 = lunes … 7 = domingo
    start_time TEXT NOT NULL,                     -- 'HH:MM'
    end_time   TEXT NOT NULL,
    room       TEXT
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    weight      REAL NOT NULL DEFAULT 0,          -- ponderación en %
    grade       REAL,                             -- null = aún sin nota
    date        TEXT,                             -- fecha de la prueba (opcional)
    study_hours REAL NOT NULL DEFAULT 0,          -- horas a repartir en el plan de estudio
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_eval_date ON evaluations(date);

  CREATE TABLE IF NOT EXISTS attendance (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    date      TEXT NOT NULL,
    present   INTEGER NOT NULL,
    PRIMARY KEY (course_id, date)
  );

  CREATE TABLE IF NOT EXISTS study_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    date       TEXT NOT NULL,
    minutes    INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_study_date ON study_sessions(date);

  CREATE TABLE IF NOT EXISTS flashcards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    front      TEXT NOT NULL,
    back       TEXT NOT NULL,
    ease       REAL NOT NULL DEFAULT 2.5,
    interval   INTEGER NOT NULL DEFAULT 0,        -- días hasta el próximo repaso
    reps       INTEGER NOT NULL DEFAULT 0,
    due        TEXT NOT NULL,                     -- fecha del próximo repaso
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_cards_due ON flashcards(due);

  -- Las tareas del plan de estudio quedan ligadas a su evaluación (para rehacer el plan).
  ALTER TABLE tasks ADD COLUMN evaluation_id INTEGER;

  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('notif_clases', '1'), ('aviso_clase_min', '10'), ('notif_pruebas', '1'),
    ('pomodoro_min', '25'), ('pomodoro_descanso', '5');
  `,

  // v8 — Gastos automáticos desde avisos del banco y visitas a la U (asistencia automática).
  `
  CREATE TABLE IF NOT EXISTS bank_alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pkg        TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    text       TEXT NOT NULL DEFAULT '',
    ts         INTEGER NOT NULL,                 -- cuándo llegó el aviso (ms)
    tipo       TEXT NOT NULL,                    -- 'compra' | 'transferencia' | 'ignorar'
    monto      INTEGER,
    comercio   TEXT,
    categoria  TEXT,
    estado     TEXT NOT NULL,                    -- 'pendiente' | 'agregado' | 'descartado' | 'ignorado'
    expense_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (pkg, ts, text)
  );
  CREATE INDEX IF NOT EXISTS idx_bank_estado ON bank_alerts(estado);

  CREATE TABLE IF NOT EXISTS campus_visits (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    enter_at TEXT NOT NULL,                      -- 'YYYY-MM-DDTHH:MM:SS' hora local
    exit_at  TEXT
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('gastos_auto_modo', 'preguntar'), ('asistencia_auto', '0'), ('campus_radio', '300');
  `,

  // v9 — Bienestar: tarjeta diaria (estilo DBT) y sesiones de calma / impulsos surfeados.
  `
  CREATE TABLE IF NOT EXISTS diary_cards (
    date        TEXT PRIMARY KEY NOT NULL,        -- un registro por día
    animo       INTEGER,                          -- 0 (muy mal) … 10 (muy bien)
    emociones   TEXT NOT NULL DEFAULT '{}',       -- JSON {tristeza: 0-5, rabia: 0-5, …}
    impulso     INTEGER,                          -- ganas de hacer algo impulsivo 0-5
    actue       INTEGER NOT NULL DEFAULT 0,       -- 1 = actué por impulso
    habilidades TEXT NOT NULL DEFAULT '[]',       -- JSON ['tipp', 'stop', …]
    sueno       REAL,                             -- horas dormidas
    nota        TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS calm_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    tipo       TEXT NOT NULL,                     -- 'calma' | 'impulso'
    antes      INTEGER,                           -- intensidad 0-10 al empezar
    despues    INTEGER,                           -- intensidad 0-10 al terminar
    logrado    INTEGER,                           -- impulso: 1 = no actué
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_calm_date ON calm_sessions(date);

  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('notif_tarjeta', '1'), ('hora_tarjeta', '22:00'), ('bienestar_bloqueo', '0');
  `,

  // v10 — Presupuesto mensual por categoría, gastos marcados como "no son repetidos" y días de cada hábito.
  `
  CREATE TABLE IF NOT EXISTS category_budgets (
    category TEXT PRIMARY KEY NOT NULL,
    monthly  INTEGER NOT NULL                  -- límite mensual en CLP
  );

  CREATE TABLE IF NOT EXISTS expense_pairs_ok (
    a INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    b INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    PRIMARY KEY (a, b)                         -- a < b: "estos dos gastos NO son el mismo"
  );

  -- Días en que toca el hábito: '1,3,5' (lunes=1 … domingo=7). NULL = todos los días.
  ALTER TABLE habits ADD COLUMN days TEXT;
  `,

  // v11 — Agenda: cada bloque de clase tiene su tipo (cátedra, ayudantía o laboratorio) y su propia sala.
  `
  ALTER TABLE class_blocks ADD COLUMN kind TEXT NOT NULL DEFAULT 'catedra';  -- 'catedra' | 'ayudantia' | 'laboratorio'
  `,

  // v12 — Subnotas: una evaluación puede estar formada por otras (ej: "Controles 10%" = promedio de 4 controles).
  // La nota de la evaluación "padre" se calcula sola con sus subnotas.
  `
  ALTER TABLE evaluations ADD COLUMN parent_id INTEGER REFERENCES evaluations(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS idx_eval_parent ON evaluations(parent_id);
  `,

  // v13 — Malla interactiva: los ramos de la carrera con semestre, créditos y prerrequisitos.
  // Cada teléfono tiene su propia malla (el nombre de la carrera va en settings: malla_nombre).
  `
  CREATE TABLE IF NOT EXISTS curriculum_courses (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    semester INTEGER NOT NULL DEFAULT 1,
    credits  INTEGER NOT NULL DEFAULT 0,          -- créditos SCT
    area     TEXT,
    prereqs  TEXT NOT NULL DEFAULT '',            -- ids de curriculum_courses separados por coma
    status   TEXT NOT NULL DEFAULT 'pendiente'    -- 'pendiente' | 'cursando' | 'aprobado'
  );
  CREATE INDEX IF NOT EXISTS idx_curr_sem ON curriculum_courses(semester);
  `,

  // v14 — Alarmas de tareas: hora de la tarea y cuántos minutos antes avisar (NULL = sin alarma).
  `
  ALTER TABLE tasks ADD COLUMN due_time TEXT;          -- 'HH:MM' o NULL
  ALTER TABLE tasks ADD COLUMN remind_min INTEGER;     -- minutos antes de due_time (0 = a la hora); NULL = sin alarma
  INSERT OR IGNORE INTO settings (key, value) VALUES ('notif_tareas', '1');
  `,

  // v15 — Chanchito: alcancía aparte de las metas. Cada movimiento suma (echar plata) o resta (sacar).
  `
  CREATE TABLE IF NOT EXISTS piggy_movements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    amount     INTEGER NOT NULL,                 -- CLP; positivo = echar, negativo = sacar
    note       TEXT,
    date       TEXT NOT NULL,                    -- 'YYYY-MM-DD'
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES ('chanchito_meta', '0');
  `,

  // v16 — Agua: cada vaso que tomas, meta diaria y recordatorios configurables.
  `
  CREATE TABLE IF NOT EXISTS water_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ml         INTEGER NOT NULL,
    date       TEXT NOT NULL,                    -- 'YYYY-MM-DD'
    time       TEXT NOT NULL,                    -- 'HH:MM'
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_water_date ON water_logs(date);
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('agua_meta_ml', '2000'), ('agua_vaso_ml', '250'), ('notif_agua', '0'),
    ('agua_cada_min', '90'), ('agua_desde', '08:00'), ('agua_hasta', '22:00'), ('agua_pausa_hasta', '');
  `,
];

/** Se llama una vez al abrir la app (desde SQLiteProvider en el _layout raíz). */
export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  // WAL = escritura más rápida; foreign_keys = borra en cascada lo relacionado;
  // busy_timeout = si otra conexión está escribiendo (ver tx.ts), espera hasta 5 s en vez de fallar.
  await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);

  await aplicarMigraciones(db, MIGRATIONS);
}

/**
 * Aplica las migraciones que falten. Cada una se guarda JUNTO con su número de versión
 * en la misma transacción: si la app se cierra a la mitad, no queda ni el cambio ni la versión
 * (SQLite deshace todo) y se reintenta la próxima vez. Exportada para probarla.
 */
export async function aplicarMigraciones(db: SQLiteDatabase, migraciones: string[]): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  // Si la base es de una versión más nueva (APK antiguo instalado encima), no se toca nada.
  while (version < migraciones.length) {
    const siguiente = version + 1;
    const sql = migraciones[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${siguiente}`);
    });
    version = siguiente;
  }
  return version;
}

/** Versión del esquema que entiende esta versión de la app. */
export const VERSION_ESQUEMA = MIGRATIONS.length;

/** Tablas que existían en la versión `v` del esquema (para validar respaldos antiguos). */
export function tablasHastaVersion(v: number): string[] {
  const tablas = new Set<string>();
  for (const sql of MIGRATIONS.slice(0, Math.max(0, v))) {
    for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) tablas.add(m[1]);
  }
  return [...tablas];
}

/** Los ajustes por defecto de todas las migraciones (se vuelven a poner tras restaurar un respaldo antiguo). */
export function ajustesPorDefecto(): string[] {
  return MIGRATIONS.flatMap((sql) => [...sql.matchAll(/INSERT OR IGNORE INTO settings[\s\S]*?;/g)].map((m) => m[0]));
}
