# Tinzit0

Mi app personal para organizar el día: tareas, gym, gastos (CLP), notas, hábitos, metas de ahorro, estudio, bienestar y un asistente de voz que habla en chileno. Todo se guarda en el celular y funciona sin internet. Con una cuenta (opcional) puedes tener **rachas con tus amigos** y un **respaldo en la nube**.

![Propuestas de ícono](docs/propuestas-icono.png)

## Funciones nuevas (v2)

| Función | Dónde está | Qué hace |
| --- | --- | --- |
| **Agenda de ramos** | Estudio → Agenda | Vista **semanal** tipo horario universitario (lunes a sábado; domingo si tienes clases) con un bloque de color por ramo: nombre, hora, sala y tipo. Vista **diaria** con las clases y las tareas que vencen ese día. Crear y editar bloques (ramo, día, inicio, término, sala, tipo y color del ramo). Aviso opcional unos minutos antes de cada clase. |
| **Salas por bloque** | Editar ramo / Agenda | Cada bloque (cátedra, ayudantía o laboratorio) tiene su propia sala. Si la dejas vacía se usa la sala principal del ramo. |
| **Subnotas** | Ramo → una evaluación → Agregar subnota | Una nota que vale, por ejemplo, 10% puede ser el promedio de otras (controles, tareas). La nota se calcula sola cuando están todas; mientras tanto ves "vas en". Cada subnota puede tener su peso dentro de la evaluación. |
| **Malla interactiva** | Estudio → Malla | Ing. Civil Informática UBB viene incluida (datos de [mallapp.cl](https://mallapp.cl/ues/ubiobio/ICINF)). También puedes pegar el link de cualquier carrera de mallapp.cl, o **armar tu malla a mano** si tu carrera no está. Tocar = aprobado; mantener presionado = cursando / editar. Los ramos bloqueados muestran qué prerrequisito te falta. |
| **Alarmas de tareas** | Nueva tarea → Hora y alarma | Ponle hora a una tarea y elige cuándo avisarte: a la hora, 10 o 30 min antes, 1 hora o 1 día antes. Funciona también con tareas que se repiten. |
| **Chanchito** 🐷 | Gastos → Chanchito | Alcancía aparte de las metas: echa plata con botones rápidos o un monto con nota, saca si lo necesitas, meta opcional. El chanchito se llena y la moneda cae por la ranura. |
| **Tomar agua** 💧 | Inicio (módulo Agua) o buscador | Meta diaria y tamaño del vaso configurables, botón "+1 vaso", vaso que se llena, historial de 7 días. Recordatorios cada X minutos dentro de un horario (ej. 8:00 a 22:00), con pausa de 1 h, 3 h o por hoy. Al cumplir la meta deja de recordarte. |
| **Cuenta** | Ajustes → Cuenta y amigos | Registro e inicio de sesión con correo y contraseña, cerrar sesión y recuperar contraseña. Tu usuario y un código de amigo de 6 letras. |
| **Amigos y rachas** 🔥 | Inicio (módulo Rachas) o Ajustes → Amigos | Buscar por usuario o código, enviar/aceptar/rechazar solicitudes. Con cada amigo eligen una o más rachas: **tareas del día**, **gym** o **meta de agua**. La racha sube cuando los dos cumplen el mismo día y se actualiza al instante en ambos teléfonos. Aviso amable a las 20:00 si hoy pueden mantenerla. |
| **Respaldo en la nube** | Ajustes → Cuenta | Al crear la cuenta se suben los datos de este teléfono. Después se respalda solo al abrir y cerrar la app (sin internet, queda para después). En un teléfono nuevo inicias sesión y se ofrece traer todo. |

**Privacidad:** tus amigos solo ven tu perfil, sus rachas juntos y si cumpliste hoy. Nunca tus notas, gastos ni ahorros. **Bienestar** (tarjeta diaria, plan de crisis), el historial del asistente, los textos de avisos del banco y tus ubicaciones **nunca salen del teléfono**; para pasarlos a otro celular usa el respaldo en archivo (Ajustes → Respaldo).

## Probar rápido con Expo Go (sin voz ni widget)

1. Instala **Expo Go** desde la Play Store.
2. En la carpeta del proyecto: `npm install` y luego `npx expo start`.
3. Celular y computador en la misma WiFi → escanea el QR con Expo Go.
   Si no conecta: `npx expo start --tunnel`.

## Configurar la cuenta y las rachas (Supabase, gratis)

La app funciona sin esto; solo se necesita para cuentas, amigos y respaldo en la nube.

1. Crea un proyecto gratis en [supabase.com](https://supabase.com) (región São Paulo queda más cerca de Chile).
2. **Base de datos:** abre *SQL Editor* → pega el contenido de `supabase/migrations/20261125000000_cuentas_amigos_rachas.sql` → **Run**.
   (Crea las tablas `profiles`, `friendships`, `checkins`, `streaks` y `backups`, todas con Row Level Security.)
3. **Claves:** *Project Settings → API*. Copia `.env.example` como `.env` y pega:
   - `EXPO_PUBLIC_SUPABASE_URL` = Project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = la clave **anon public**

   ⚠️ Nunca pongas la `service_role` key en la app. El `.env` está en el `.gitignore` (no se sube a GitHub).
4. **Recuperar contraseña:** *Authentication → URL Configuration → Redirect URLs* → agrega `tinzit0://recuperar`.
5. Reinicia `npx expo start` (el `.env` se lee al iniciar).
6. Para el APK con EAS, las claves no viajan en el `.env`: agrégalas una vez con
   `npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://…supabase.co" --environment preview --visibility plaintext`
   (y lo mismo con `EXPO_PUBLIC_SUPABASE_ANON_KEY`).

**Con tu amigo:** los dos instalan la app, cada uno crea su cuenta, uno busca al otro por usuario o código (Ajustes → Amigos), el otro acepta y eligen la racha.

## Development build (con voz y widget)

La voz (`expo-speech-recognition`) y el widget usan código nativo que **no viene en Expo Go**. Por eso se compila una versión propia de la app (un APK), una sola vez:

1. Crea una cuenta gratis en https://expo.dev
2. `npm install -g eas-cli` y luego `eas login`
3. `eas build --profile development --platform android`
   (la compilación es en la nube y se demora unos 10–20 minutos)
4. Al terminar, abre el enlace en el celular, descarga el APK e instálalo
   (Android te pedirá permitir "instalar apps desconocidas").
5. En el computador: `npx expo start --dev-client` y abre **Tinzit0** en el celular (no Expo Go).

Desde ahí, los cambios de código se ven al tiro igual que en Expo Go. Solo hay que volver al paso 3 si se agrega una librería nativa nueva.

## Comandos útiles

- `npm test` — todas las pruebas (base de datos, asistente, estudio, finanzas, bienestar, integridad, privacidad, malla, agua y nube)
- `npx tsc --noEmit` — revisar tipos
- `npm run lint` — revisar el código
- `npx expo start --web` — ver la app en el navegador (sin notificaciones ni voz)
- `node scripts/generar-iconos.mjs lima <carpeta-resvg>` — cambiar el estilo del ícono

## Créditos

Malla de Ing. Civil Informática UBB: [mallapp.cl](https://mallapp.cl) (Rodrigo Palacios).
