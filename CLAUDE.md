# Tinzit0 — guía del proyecto

App móvil **personal** (un solo usuario, Android) para organizar el día: tareas, gym, gastos en CLP, notas, hábitos, metas de ahorro, estadísticas y un asistente de voz. Todo se guarda **local** en el celular (SQLite). Sin cuentas ni servidores.

- El dueño **no es programador**: explicar en español simple, paso a paso. UI y comentarios del código en **español chileno informal** (mensajes cercanos, motivadores).
- Flujo de trabajo: trabajar por fases, **commit + push a `main`** al cerrar cada una (repo público `github.com/tinzit0/app-tinzit0`), y explicar cómo probar en el celular.
- Repo público: **nunca** poner datos personales (dirección, etc.) en código ni commits.
- Diseño "alta gama": seguir los tokens de `src/theme/tokens.ts` (grafito + acento lima, Inter, letterSpacing negativo en títulos). No inventar colores sueltos.

## Stack

- Expo **SDK 58**, React Native 0.88, React 19, TypeScript estricto, **Expo Router** (rutas en `src/app`).
- `expo-sqlite` (datos), `AsyncStorage` (solo preferencia de tema), `expo-secure-store` (futura API key).
- `expo-notifications` (locales), `react-native-reanimated` 4 (animaciones), `react-native-svg` (gráficos hechos a mano).
- Development build: `expo-speech-recognition` (voz), `expo-speech` (TTS), `react-native-android-widget` (widget), `expo-dev-client`.
- Antes de usar una API de Expo, verificar la doc de SDK 58 (ver `AGENTS.md`): Expo cambia entre versiones.

## Comandos

```bash
npx expo start            # dev server (Expo Go o development build)
npx expo start --web      # vista previa en navegador (para revisar UI con Playwright)
npm test                  # pruebas: base de datos (node:sqlite) + asistente (90 casos)
npx tsx scripts/test-clima.ts  # prueba real contra Open-Meteo (necesita internet)
npx tsc --noEmit          # chequeo de tipos
npx expo-doctor           # salud de dependencias
npx expo install <pkg>    # SIEMPRE así (no npm install) para versiones compatibles
npx eas-cli build -p android --profile preview --non-interactive --no-wait   # APK instalable (cuenta EAS: tinzit0)
node scripts/generar-iconos.mjs <grafito|lima|noche|todos|widget> <carpeta-con-@resvg/resvg-js>
```

En Windows el watcher de Metro **no detecta cambios de archivos** de forma fiable: reiniciar `expo start` para ver cambios (y siempre al agregar rutas nuevas).

## Estructura

```
index.ts                 entrada: registra el widget y luego importa expo-router/entry
src/app/                 rutas (archivos de 2 líneas que re-exportan una pantalla de src/screens)
  _layout.tsx            providers: Theme → SQLite(migraciones) → LockGate → Logros → Voz → Stack
  (tabs)/                Hoy · Tareas · Gym · Gastos · Notas (JS Tabs, sin animación al cambiar)
src/screens/             pantallas reales
src/components/          UI reutilizable (Card, Chip, Button, Field, Fab, PressableScale, LineChart,
                         DonutChart, Heatmap, MicOrb, RestTimer, LockGate, LogrosProvider, AppLifecycle…)
src/database/            acceso a datos por módulo (tareas, gastos, fijos, metas, gym, cuerpo,
                         habitos, logros, notas, apps, respaldo, estadisticas, queries=settings)
  schema.ts              MIGRACIONES versionadas con PRAGMA user_version (v1…v5)
src/notifications/       mensajes.ts (personalidad) + programar.ts (agenda 7 días)
src/voice/               texto.ts (normalizar, "ey Tinzit0"), interpretar.ts (NLU local, puro, ~40 intenciones + contexto),
                         ejecutar.ts (acciones + respuestas + historial; devuelve "accion" para la UI),
                         acciones.ts (navegar / abrir app / recordatorio), reconocedor.ts, hablar.ts,
                         VozProvider.tsx (wake word con app abierta), resumen.ts (datos para la IA),
                         ia.ts (Claude claude-opus-5-5 + Tool Runner, carga diferida), iaConfig.ts (API key en SecureStore)
src/clima/clima.ts       Open-Meteo (sin key), caché 30 min en settings, Concepción por defecto
src/widget/              datos.ts, ResumenWidget.tsx, lib.ts (carga segura), index.tsx
src/theme/               tokens.ts, ThemeProvider.tsx (sistema/claro/oscuro)
src/utils/               fechas (semana parte lunes), moneda (formatCLP), montos (parseMonto a la chilena),
                         categorias (paleta validada para daltonismo, orden fijo), apps (catálogo)
plugins/withAppQueries.js  <queries> de Android para abrir apps favoritas / leer su ícono
scripts/                 test-db.ts, test-voz.ts, db-prueba.ts (adaptador node:sqlite), generar-iconos.mjs
docs/propuestas-icono.png  3 estilos de ícono (por defecto: 1 "Grafito + Lima")
```

## Reglas del código

- **Migraciones**: nunca editar una existente; agregar una nueva al final de `MIGRATIONS`. Settings con `INSERT OR IGNORE`.
- Toda consulta SQL vive en `src/database/*`, parametrizada. Fechas como texto `YYYY-MM-DD` en hora local.
- **Módulos nativos que no existen en Expo Go** (voz, widget) se cargan con `require` dentro de `try` (`reconocedor.ts`, `widget/lib.ts`). Mantener ese patrón: la app debe seguir abriendo en Expo Go.
- Animaciones: Reanimated, solo `transform`/`opacity`, curva `Easing.bezier(0.23, 1, 0.32, 1)`, respetar "reducir movimiento". Sin animación en cambios de pestaña. Hápticos solo en eventos con significado.
- Notificaciones: `reprogramarTodo` borra todo lo agendado **excepto** `data.tipo === 'descanso'` (temporizador).
- Gráficos de categorías: siempre en el orden fijo de `CATEGORIAS`, colores con `colorCategoria(c, isDark)`.
- Nueva intención del asistente: agregarla en `interpretar.ts` + `ejecutar.ts` + (si es una acción) una herramienta en `ia.ts` + un caso en `scripts/test-voz.ts`.
- **SDK de Anthropic + Metro**: su build ESM tiene importaciones circulares que caen en runtime. `metro.config.js` fuerza la versión CommonJS (`isESMImport: false`). No quitarlo. `ia.ts` solo se importa con `await import()` para no cargar el SDK al abrir la app.
- Notificaciones con `data.tipo` `descanso` o `recordatorio` no se borran al reprogramar.
- Correr `npx tsc --noEmit` y `npm test` antes de cada commit. Revisar UI con Playwright en 375 px (modo claro y oscuro).

## Funciones (estado al 2026-11-20)

Hoy (saludo, tareas, gym, gasto semanal, hábitos, apps favoritas, accesos a estadísticas/medallas, micrófono) ·
Tareas (hoy/semana/todas, prioridad, repetición diaria o por días) · Gastos (CLP, categorías, semana/mes,
presupuesto con aviso 80/100 %, gastos fijos con cobro automático, metas de ahorro con abonos) · Gym (rutina
semanal, series/reps/peso, historial y gráfico, temporizador de descanso 60/90/120 s, peso y medidas) · Notas ·
Hábitos (rachas, mapa de calor) · 16 logros con celebración · Estadísticas mensuales vs mes anterior ·
Notificaciones (mañana con clima, noche, domingo, pagos fijos; horas configurables) · Respaldo JSON exportar/importar +
recordatorio semanal · Bloqueo con huella · Asistente de voz/texto con "ey Tinzit0" (app abierta), ~40 comandos sin internet y modo IA opcional con Claude (API key del usuario) · Clima (Open-Meteo) · Widget Android ·
Ícono y splash.

## Pendiente / ideas

- Elegir estilo de ícono definitivo (ver `docs/propuestas-icono.png`).
- Agregar la app del banco del usuario al catálogo de `src/utils/apps.ts` (+ `plugins/withAppQueries.js`).
- Activación por voz con la app cerrada (servicio nativo / Picovoice Porcupine).
