/**
 * Mensajes de Tinzit0, en chileno informal y con buena onda.
 * Cada tipo tiene varias versiones y se elige una al azar para que no aburra.
 * El asistente de voz también usa estos textos, así la personalidad es la misma.
 */
import { formatCLP } from '@/utils/moneda';

function alAzar<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

// ---------- Mañana ----------

export function mensajeManana(p: { nombre: string; tareas: number; gym: string | null; clima?: string | null }) {
  const hola = p.nombre ? `Buenos días, ${p.nombre}` : 'Buenos días';
  const titulo = alAzar([`${hola} ☀️`, `${hola}! Arriba ese ánimo ☀️`, `${hola} 👋`]);

  const partes: string[] = [];
  if (p.tareas === 0) partes.push(alAzar(['Hoy no tienes tareas, día relajado', 'Agenda limpia por hoy']));
  else partes.push(alAzar([
    `Tienes ${plural(p.tareas, 'tarea', 'tareas')} para hoy`,
    `Hoy te esperan ${plural(p.tareas, 'tarea', 'tareas')}`,
  ]));
  if (p.gym) partes.push(alAzar([`toca ${p.gym.toLowerCase()} en el gym 💪`, `y hoy es día de ${p.gym.toLowerCase()} 🏋️`]));
  else partes.push(alAzar(['y hoy es día de descanso del gym', 'sin gym hoy, a recargar pilas']));

  const cierre = alAzar(['¡Vamos con todo!', 'Tú puedes.', 'A darle.']);
  // El clima va primero y en su propia línea: es lo primero que uno quiere saber al despertar.
  const linea = `${partes.join(', ')}. ${cierre}`;
  return { titulo, cuerpo: p.clima ? `${p.clima}\n${linea}` : linea };
}

// ---------- Noche ----------

export function mensajeNoche(p: { pendientes: number }) {
  return {
    titulo: alAzar(['Ojo, que queda poco día 🌙', 'Antes de dormir… 👀', 'Último llamado del día 🌙']),
    cuerpo: alAzar([
      `Te ${p.pendientes === 1 ? 'queda 1 tarea' : `quedan ${p.pendientes} tareas`} por hoy. ¿Le damos un último empujón?`,
      `Ya po, ${p.pendientes === 1 ? 'falta 1 tarea' : `faltan ${p.pendientes} tareas`}. Si no alcanzas, muévelas pa' mañana y listo.`,
      `${plural(p.pendientes, 'tarea pendiente', 'tareas pendientes')}. Cero estrés, pero dale una mirada.`,
    ]),
  };
}

// ---------- Domingo ----------

export function mensajeDomingo(p: {
  tareas: number;
  gym: number;
  gasto: number;
  gastoAnterior: number;
  pedirRespaldo: boolean;
}) {
  const lineas = [
    `✅ ${plural(p.tareas, 'tarea completada', 'tareas completadas')}`,
    `💪 ${plural(p.gym, 'día de gym', 'días de gym')}`,
  ];
  if (p.gastoAnterior > 0) {
    const dif = p.gasto - p.gastoAnterior;
    lineas.push(
      `💸 ${formatCLP(p.gasto)} gastados (${dif > 0 ? `${formatCLP(dif)} más` : `${formatCLP(-dif)} menos`} que la semana pasada)`,
    );
  } else {
    lineas.push(`💸 ${formatCLP(p.gasto)} gastados`);
  }
  if (p.pedirRespaldo) lineas.push('☁️ Y aprovecha de hacer tu respaldo semanal');

  const buenaSemana = p.tareas >= 10 || p.gym >= 3;
  return {
    titulo: buenaSemana
      ? alAzar(['Semanón 🔥 Aquí va tu resumen', 'Qué semana más buena 🙌'])
      : alAzar(['Tu resumen de la semana 📊', 'Así te fue esta semana 📊']),
    cuerpo: lineas.join('\n'),
  };
}

// ---------- Otros ----------

export function mensajeGastoFijo(p: { nombre: string; monto: number }) {
  return {
    titulo: alAzar(['Mañana toca pagar 💳', 'Recordatorio de pago 💳']),
    cuerpo: `${p.nombre}: ${formatCLP(p.monto)}. Que no se te pase.`,
  };
}

export const MENSAJE_PRUEBA = {
  titulo: 'Hola, soy Tinzit0 👋',
  cuerpo: 'Así te voy a ir hablando. Si ves esto, las notificaciones funcionan perfecto.',
};
