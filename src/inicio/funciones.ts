/**
 * Catálogo de funciones de la app para el buscador (puro: se prueba en Node).
 * Cada función tiene palabras con las que la podrías buscar ("plata" → Gastos).
 */
import { normalizar } from '@/voice/texto';

export type Funcion = { titulo: string; detalle: string; ruta: string; icono: string; palabras: string };

export const FUNCIONES: Funcion[] = [
  { titulo: 'Inicio', detalle: 'Resumen de tu día', ruta: '/', icono: 'home-outline', palabras: 'hoy resumen principal' },
  { titulo: 'Tareas', detalle: 'Pendientes de hoy, semana y todas', ruta: '/tareas', icono: 'checkbox-outline', palabras: 'pendientes cosas por hacer lista to do' },
  { titulo: 'Nueva tarea', detalle: 'Agregar algo por hacer', ruta: '/tarea', icono: 'add-circle-outline', palabras: 'crear agregar pendiente recordar' },
  { titulo: 'Gastos', detalle: 'Lo que gastas por semana y mes', ruta: '/gastos', icono: 'wallet-outline', palabras: 'plata dinero lucas pesos presupuesto compras' },
  { titulo: 'Nuevo gasto', detalle: 'Anotar una compra', ruta: '/gasto', icono: 'card-outline', palabras: 'anotar compra pagar plata lucas' },
  { titulo: 'Presupuestos por categoría', detalle: 'Límite mensual para comida, transporte…', ruta: '/presupuestos', icono: 'pie-chart-outline', palabras: 'limite categoria mensual plata comida' },
  { titulo: 'Gastos repetidos', detalle: 'Revisar posibles gastos anotados dos veces', ruta: '/duplicados', icono: 'copy-outline', palabras: 'duplicado doble repetido banco boleta' },
  { titulo: 'Gastos fijos', detalle: 'Arriendo, plan del celular, suscripciones', ruta: '/fijos', icono: 'repeat-outline', palabras: 'arriendo cuentas suscripciones netflix mensual' },
  { titulo: 'Gastos del banco', detalle: 'Compras detectadas en avisos del banco', ruta: '/gastos-banco', icono: 'notifications-outline', palabras: 'banco tarjeta notificaciones automaticos' },
  { titulo: 'Escanear boleta', detalle: 'Foto de la boleta → gasto', ruta: '/boleta', icono: 'receipt-outline', palabras: 'boleta recibo ticket foto camara' },
  { titulo: 'Metas de ahorro', detalle: 'Ahorrar para algo', ruta: '/metas', icono: 'flag-outline', palabras: 'ahorro ahorrar meta viaje juntar' },
  { titulo: 'Chanchito', detalle: 'Tu alcancía: echa lo que ahorras', ruta: '/chanchito', icono: 'wallet-outline', palabras: 'chanchito alcancia ahorro ahorrar monedas guardar plata' },
  { titulo: 'Tomar agua', detalle: 'Meta diaria y recordatorios', ruta: '/agua', icono: 'water-outline', palabras: 'agua hidratacion vaso litros tomar beber recordatorio' },
  { titulo: 'Amigos y rachas', detalle: 'Rachas compartidas con tus amigos', ruta: '/amigos', icono: 'flame-outline', palabras: 'amigos racha rachas fueguito daniel compartir social' },
  { titulo: 'Cuenta', detalle: 'Iniciar sesión y respaldo en la nube', ruta: '/cuenta', icono: 'person-circle-outline', palabras: 'cuenta sesion login registrarse contraseña nube respaldo supabase' },
  { titulo: 'Gym', detalle: 'Rutina, series y progreso', ruta: '/gym', icono: 'barbell-outline', palabras: 'entrenar ejercicio pesas rutina' },
  { titulo: 'Rutina semanal', detalle: 'Qué toca cada día', ruta: '/rutina', icono: 'calendar-outline', palabras: 'piernas pecho espalda dia gym' },
  { titulo: 'Cuerpo', detalle: 'Peso y medidas', ruta: '/cuerpo', icono: 'body-outline', palabras: 'peso kilos medidas cintura' },
  { titulo: 'Notas', detalle: 'Ideas y apuntes', ruta: '/notas', icono: 'document-text-outline', palabras: 'apuntes ideas escribir' },
  { titulo: 'Nueva nota', detalle: 'Escribir algo rápido', ruta: '/nota', icono: 'create-outline', palabras: 'escribir anotar idea' },
  { titulo: 'Hábitos', detalle: 'Rachas y mapa de calor', ruta: '/habitos', icono: 'flame-outline', palabras: 'rutina diaria racha costumbre' },
  { titulo: 'Estadísticas', detalle: 'Tu mes vs el anterior', ruta: '/estadisticas', icono: 'stats-chart-outline', palabras: 'numeros mes comparar graficos' },
  { titulo: 'Medallas', detalle: 'Logros desbloqueados', ruta: '/logros', icono: 'trophy-outline', palabras: 'logros premios trofeos' },
  { titulo: 'Estudio', detalle: 'Ramos, notas y pruebas', ruta: '/estudio', icono: 'school-outline', palabras: 'universidad u ramos cursos notas promedio' },
  { titulo: 'Agenda de ramos', detalle: 'Tu horario semanal y diario', ruta: '/horario', icono: 'time-outline', palabras: 'horario clases sala bloque catedra ayudantia laboratorio semana dia' },
  { titulo: 'Malla interactiva', detalle: 'Ramos aprobados y prerrequisitos', ruta: '/malla', icono: 'git-network-outline', palabras: 'malla curricular carrera ramos aprobados prerrequisitos creditos semestre' },
  { titulo: 'Modo enfoque', detalle: 'Pomodoro para estudiar', ruta: '/pomodoro', icono: 'timer-outline', palabras: 'pomodoro concentracion estudiar temporizador' },
  { titulo: 'Tarjetas de estudio', detalle: 'Repaso con repetición espaciada', ruta: '/tarjetas', icono: 'albums-outline', palabras: 'flashcards memorizar repasar' },
  { titulo: 'Grabar clase', detalle: 'Transcribir lo que dice el profe', ruta: '/grabar', icono: 'mic-outline', palabras: 'dictado transcripcion clase grabar' },
  { titulo: 'Escanear apuntes', detalle: 'Foto de apuntes → texto', ruta: '/escanear', icono: 'scan-outline', palabras: 'ocr foto apuntes pizarra' },
  { titulo: 'Asistencia automática', detalle: 'Marca "fui" cuando llegas a la U', ruta: '/campus', icono: 'location-outline', palabras: 'asistencia ubicacion campus universidad' },
  { titulo: 'Bienestar', detalle: 'Ánimo, calma y patrones', ruta: '/bienestar', icono: 'leaf-outline', palabras: 'salud mental animo emociones dbt' },
  { titulo: 'Estoy a mil', detalle: 'Bajar una emoción muy fuerte', ruta: '/calma', icono: 'pulse-outline', palabras: 'ansiedad angustia calma respirar crisis' },
  { titulo: 'Plan de crisis', detalle: 'Líneas de ayuda y tus contactos', ruta: '/plan-crisis', icono: 'shield-checkmark-outline', palabras: 'ayuda 4141 emergencia contactos' },
  { titulo: 'Asistente Tinzit0', detalle: 'Habla o escribe lo que necesitas', ruta: '/asistente', icono: 'chatbubble-ellipses-outline', palabras: 'voz jarvis hablar preguntar ia' },
  { titulo: 'Clima', detalle: 'Pronóstico de 7 días', ruta: '/clima', icono: 'partly-sunny-outline', palabras: 'tiempo lluvia temperatura' },
  { titulo: 'Música', detalle: 'Spotify', ruta: '/musica', icono: 'musical-notes-outline', palabras: 'spotify canciones playlist' },
  { titulo: 'Tus apps', detalle: 'Accesos a apps favoritas', ruta: '/apps', icono: 'apps-outline', palabras: 'aplicaciones accesos directos' },
  { titulo: 'Ordenar Inicio', detalle: 'Mostrar, ocultar y ordenar módulos', ruta: '/inicio-config', icono: 'reorder-four-outline', palabras: 'configurar personalizar inicio modulos ocultar' },
  { titulo: 'Ajustes', detalle: 'Notificaciones, respaldo, huella, tema', ruta: '/ajustes', icono: 'settings-outline', palabras: 'configuracion respaldo huella tema oscuro notificaciones' },
];

/** Busca por título, detalle y palabras (sin tildes). Las coincidencias en el título van primero. */
export function buscarFunciones(consulta: string, lista: Funcion[] = FUNCIONES): Funcion[] {
  const q = normalizar(consulta).trim();
  if (!q) return lista;
  const partes = q.split(/\s+/).filter(Boolean);
  const puntaje = (f: Funcion) => {
    const titulo = normalizar(f.titulo);
    const todo = `${titulo} ${normalizar(f.detalle)} ${normalizar(f.palabras)}`;
    if (!partes.every((p) => todo.includes(p))) return 0;
    let s = 1;
    if (titulo.startsWith(q)) s += 3;
    else if (titulo.includes(q)) s += 2;
    if (partes.some((p) => titulo.split(' ').some((w) => w.startsWith(p)))) s += 1;
    return s;
  };
  return lista
    .map((f, k) => ({ f, s: puntaje(f), k }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.k - b.k)
    .map((x) => x.f);
}
