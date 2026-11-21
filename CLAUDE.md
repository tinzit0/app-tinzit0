# Tinzit0 — guía del proyecto

App móvil **personal** (un solo usuario, Android) para organizar el día: tareas, gym, gastos en CLP, notas, hábitos, metas de ahorro, estadísticas y un asistente de voz. Todo se guarda **local** en el celular (SQLite). Sin cuentas ni servidores.

- El dueño **no es programador**: explicar en español simple, paso a paso. UI y comentarios del código en **español chileno informal** (mensajes cercanos, motivadores).
- Flujo de trabajo: trabajar por fases, **commit + push a `main`** al cerrar cada una (repo público `github.com/tinzit0/app-tinzit0`), y explicar cómo probar en el celular.
- Repo público: **nunca** poner datos personales (dirección, etc.) en código ni commits.
- **Todo debe ser gratis**: el usuario pidió no usar servicios de pago (se quitó el modo IA con Claude). Preferir APIs sin clave y sin costo (ej. Open-Meteo) y funciones en el celular.
- Diseño "alta gama": seguir los tokens de `src/theme/tokens.ts` (grafito + acento lima, Inter, letterSpacing negativo en títulos). No inventar colores sueltos.

## Stack

- Expo **SDK 58**, React Native 0.88, React 19, TypeScript estricto, **Expo Router** (rutas en `src/app`).
- `expo-sqlite` (datos), `AsyncStorage` (solo preferencia de tema), 
- `expo-notifications` (locales), `react-native-reanimated` 4 (animaciones), `react-native-svg` (gráficos hechos a mano).
- Development build: `expo-speech-recognition` (voz), `expo-speech` (TTS), `react-native-android-widget` (widget), `expo-dev-client`.
- Antes de usar una API de Expo, verificar la doc de SDK 58 (ver `AGENTS.md`): Expo cambia entre versiones.

## Comandos

```bash
npx expo start            # dev server (Expo Go o development build)
npx expo start --web      # vista previa en navegador (para revisar UI con Playwright)
npm test                  # pruebas: base de datos (node:sqlite) + asistente + modo estudiante
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
  schema.ts              MIGRACIONES versionadas con PRAGMA user_version (v1…v9)
src/notifications/       mensajes.ts (personalidad) + programar.ts (agenda 7 días)
src/voice/               texto.ts (normalizar, "ey Tinzit0"), interpretar.ts (NLU local, puro, ~40 intenciones + contexto),
                         ejecutar.ts (acciones + respuestas + historial; devuelve "accion" para la UI),
                         acciones.ts (navegar / abrir app / recordatorio), reconocedor.ts, hablar.ts,
                         VozProvider.tsx (wake word con app abierta)
src/jarvis/                Asistente estilo Jarvis (gratis, local): Reactor.tsx (HUD SVG animado), Boot.tsx (arranque),
                         PanelHud.tsx + paneles.ts/panelesDatos.ts (datos por intención), persona.ts (estilo jarvis/cercano),
                         colores.ts (colores HUD cambiables por voz). Wake word acepta "Jarvis" y "ey Tinzit0".
src/ia/                  IA DENTRO DEL CELULAR (gratis): modelo.ts (react-native-executorch 0.11, Qwen3 1.7B XNNPACK,
                         descarga desde Ajustes, require con try, sesión reutilizada y renovada), parser.ts (<tool_call>).
                         Una sola herramienta "ejecutar_comando" → pasa por el intérprete de siempre.
src/voice/reglasExtra.ts  ayuda "¿cómo hago…?", fijos, estadísticas, medallas, récords, rutina por día, tema, temporizador, enseñar/olvidar
src/voice/similitud.ts + corpus.ts + aprender.ts   entender por parecido y aprender (tabla voice_learned, migración v6)
src/spotify/spotify.ts   Spotify gratis: sin cuenta → intent MEDIA_PLAY_FROM_SEARCH; con Client ID del usuario (PKCE, expo-auth-session,
                         tokens en SecureStore) → qué suena, buscar, playlists; control solo Premium (si no, abre en Spotify)
src/voice/reglasApps.ts   música (pon/pausa/siguiente/qué suena) y acciones en otras apps (YouTube, Google, Maps, WhatsApp, llamar) → utils/enlaces.ts
src/estudio/logica.ts    MODO ESTUDIANTE (puro, probado en scripts/test-estudio.ts): notas 1,0–7,0, promedio ponderado,
                         notaNecesaria, planEstudio (sesiones ≥1 h hasta el día antes), claseAhora, SM-2 (repasar),
                         tarjetasDesdeTexto, resumirTexto (extractivo). conIA.ts: intenta IA local (generarTexto) y si no, sin IA.
src/database/estudio.ts  courses, class_blocks, evaluations, attendance, study_sessions, flashcards (migración v7);
                         el plan de estudio crea tareas con tasks.evaluation_id (se rehace al editar la evaluación)
src/voice/reglasEstudio.ts  "cómo voy en X", "me saqué un 5,5 en…", "tengo prueba de X el viernes", "falté a X", "modo enfoque"…
                         Va PRIMERA en interpretar (antes que "cómo voy" = resumen). Preguntas "cómo uso…" → ayuda.
src/ia/ocr.ts            leer texto de fotos: react-native-executorch/legacy OCRModule + OCR_SPANISH (feature "ocr" en package.json)
Pantallas de estudio     Estudio, Ramo, RamoForm, EvaluacionForm, Horario, Pomodoro, Tarjetas, Repaso, GrabarClase
                         (dictado continuo + keep-awake + pausa de "ey Tinzit0"), Escanear (expo-image-picker)
src/finanzas/             banco.ts (entender avisos de compra de bancos chilenos; lista AMPLIA de paquetes, no singularizar),
                         boleta.ts (total/local/fecha desde OCR), proyeccion.ts ("hoy puedes gastar", fin de mes),
                         sincronizar.ts (cola nativa → bank_alerts). Probado en scripts/test-finanzas.ts.
modules/tinzit0-avisos/  MÓDULO NATIVO PROPIO (Kotlin, Expo Modules): NotificationListenerService que guarda SOLO avisos de
                         apps de bancos en una cola (SharedPreferences); la app la procesa al abrir o en vivo (evento onAviso).
                         Android 13+ con APK: hay que "Permitir ajustes restringidos" en la info de la app.
src/estudio/campusTarea.ts  asistencia automática: geocerca (expo-location + expo-task-manager, ubicación "todo el tiempo").
                         defineTask se importa en index.ts. Visitas en campus_visits; conciliarAsistencia marca "fui".
                         Pregunta "¿Fuiste a X?" con botones (categoría 'asistencia') al terminar cada clase no detectada.
src/bienestar/            BIENESTAR / salud mental (habilidades DBT). logica.ts (puro: detectarRiesgo, descubrirPatrones,
                         diaDificil, faseImpulso, resumenParaTerapia), privacidad.ts (huella opcional; calma y plan de crisis
                         NUNCA se bloquean). database/bienestar.ts: diary_cards, calm_sessions (migración v9), plan en settings.
                         Pantallas: Bienestar, Calma ("Estoy a mil"), Impulso, TarjetaDiaria, Patrones, PlanCrisis, Habilidades.
                         SEGURIDAD: frases de hacerse daño → intención 'crisis' ANTES que todo (también antes de lo aprendido)
                         con *4141 / 131. No quitar. Textos de notificación discretos. Probado en scripts/test-bienestar.ts.
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
- Nueva intención del asistente: agregarla en `interpretar.ts` + `ejecutar.ts` + un caso en `scripts/test-voz.ts`.
- Cerebro del asistente en 3 capas: aprendido → reglas → parecido (≥0.6) → IA en el celular (si está descargada y activa) → "¿Quisiste decir…?". Nunca servicios de pago.
- react-native-executorch: config `"react-native-executorch": {"features": ["llm"]}` y `allowScripts` en package.json (su postinstall descarga libs nativas); minSdk 26 vía expo-build-properties.
- Reconocimiento de voz: si Android no entrega resultado final, se usa el último parcial (reconocedor.ts). No quitar: era el bug "transcribe pero no responde".
- Notificaciones con `data.tipo` `descanso`, `recordatorio` o `pomodoro` no se borran al reprogramar. Los avisos de clase (`notif_clases`) y de pruebas (`notif_pruebas`) se agendan en `reprogramarTodo`.
- Correr `npx tsc --noEmit` y `npm test` antes de cada commit. El módulo nativo solo se valida compilando con EAS. Revisar UI con Playwright en 375 px (modo claro y oscuro).

## Funciones (estado al 2026-11-21)

Hoy (saludo, tareas, gym, gasto semanal, hábitos, apps favoritas, accesos a estadísticas/medallas, micrófono) ·
Tareas (hoy/semana/todas, prioridad, repetición diaria o por días) · Gastos (CLP, categorías, semana/mes,
presupuesto con aviso 80/100 %, gastos fijos con cobro automático, metas de ahorro con abonos) · Gym (rutina
semanal, series/reps/peso, historial y gráfico, temporizador de descanso 60/90/120 s, peso y medidas) · Notas ·
Hábitos (rachas, mapa de calor) · 16 logros con celebración · Estadísticas mensuales vs mes anterior ·
Notificaciones (mañana con clima, noche, domingo, pagos fijos; horas configurables) · Respaldo JSON exportar/importar +
recordatorio semanal · Bloqueo con huella · Asistente de voz/texto con "ey Tinzit0" (app abierta), ~40 comandos sin internet · Clima (Open-Meteo) · Widget Android ·
Ícono y splash · Modo Estudiante (ramos, notas chilenas y "cuánto necesito", horario con aviso antes de clase, asistencia,
pruebas con plan de estudio en Tareas, Pomodoro con lofi, tarjetas con repetición espaciada, grabar clase → texto/resumen,
escanear apuntes sin internet, resumen semanal por voz) · Gastos automáticos desde avisos del banco · Boletas escaneadas → gasto ·
"Hoy puedes gastar" y proyección de fin de mes · Asistencia automática por ubicación de la U ·
Bienestar (Estoy a mil, surfear impulso, tarjeta diaria DBT, patrones de ánimo, plan de crisis con *4141, habilidades,
resumen para el psicólogo/a).

## Pendiente / ideas

- Elegir estilo de ícono definitivo (ver `docs/propuestas-icono.png`).
- Agregar la app del banco del usuario al catálogo de `src/utils/apps.ts` (+ `plugins/withAppQueries.js`).
- Activación por voz con la app cerrada (servicio nativo / Picovoice Porcupine).
