/**
 * Programación de notificaciones locales.
 *
 * Cómo funciona (importante):
 * Las notificaciones locales se "agendan" con su texto ya escrito. La app no
 * puede despertarse a las 8:00 para revisar tus tareas. Por eso, cada vez que
 * abres o sales de la app, borramos lo agendado y lo volvemos a agendar para
 * los próximos 7 días con tus datos actualizados.
 * Si pasas más de una semana sin abrir la app, dejan de llegar (y ahí te
 * llega un último aviso suave pidiéndote que la abras).
 */
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { rangoSemana, rangoSemanaAnterior, totalEnRango } from '@/database/gastos';
import { fijosQueVencenEn } from '@/database/fijos';
import { diasEntrenados, rutinaDeHoy } from '@/database/gym';
import { getSetting } from '@/database/queries';
import { necesitaRespaldo } from '@/database/respaldo';
import { completadasEnRango, tareasDelDia } from '@/database/tareas';
import { toISODate, weekdayMonFirst } from '@/utils/fechas';
import { mensajeDomingo, mensajeGastoFijo, mensajeManana, mensajeNoche, MENSAJE_PRUEBA } from './mensajes';

const CANAL = 'tinzit0';
const DIAS_ADELANTE = 7;

/** Cómo se muestran las notificaciones si llegan con la app abierta. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Crea el canal de Android y pide permiso. Devuelve si quedó permitido. */
export async function prepararNotificaciones(pedir = true): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Recordatorios de Tinzit0',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#CFF56B',
    });
  }
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  if (!pedir || !actual.canAskAgain) return false;
  const r = await Notifications.requestPermissionsAsync();
  return r.granted;
}

/** "08:30" → { h: 8, m: 30 } */
function leerHora(s: string | null, defecto: string) {
  const [h, m] = (s ?? defecto).split(':').map(Number);
  return { h: Number.isFinite(h) ? h : 8, m: Number.isFinite(m) ? m : 0 };
}

function enFecha(base: Date, h: number, m: number) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
  return d;
}

async function agendar(titulo: string, cuerpo: string, fecha: Date, data: Record<string, string> = {}) {
  if (fecha.getTime() <= Date.now() + 30_000) return; // no agendar en el pasado
  await Notifications.scheduleNotificationAsync({
    content: { title: titulo, body: cuerpo, data, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fecha, channelId: CANAL },
  });
}

let enCurso: Promise<void> | null = null;

/** Borra todo lo agendado y lo vuelve a agendar con los datos actuales. */
export function reprogramarTodo(db: SQLiteDatabase): Promise<void> {
  // Evita que dos reprogramaciones se pisen.
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      if (!(await prepararNotificaciones(false))) return;
      // Borramos solo los avisos "de agenda". El del temporizador de descanso se respeta
      // (si no, al salir de la app durante el descanso, la alarma desaparecería).
      const agendadas = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        agendadas
          .filter((n) => n.content.data?.tipo !== 'descanso')
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
      );

      const on = async (k: string) => (await getSetting(db, k)) !== '0';
      const nombre = (await getSetting(db, 'nombre')) ?? '';
      const manana = leerHora(await getSetting(db, 'hora_manana'), '08:00');
      const noche = leerHora(await getSetting(db, 'hora_noche'), '21:30');
      const domingo = leerHora(await getSetting(db, 'hora_domingo'), '20:00');
      const [onManana, onNoche, onDomingo, onFijos] = await Promise.all([
        on('notif_manana'),
        on('notif_noche'),
        on('notif_domingo'),
        on('notif_fijos'),
      ]);

      const hoy = new Date();
      for (let i = 0; i < DIAS_ADELANTE; i++) {
        const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
        const iso = toISODate(dia);
        const tareas = await tareasDelDia(db, iso);
        const pendientes = tareas.filter((t) => !t.hecha).length;

        if (onManana) {
          const gym = await rutinaDeHoy(db, dia);
          const m = mensajeManana({ nombre, tareas: pendientes, gym });
          await agendar(m.titulo, m.cuerpo, enFecha(dia, manana.h, manana.m), { ruta: '/' });
        }
        if (onNoche && pendientes > 0) {
          const n = mensajeNoche({ pendientes });
          await agendar(n.titulo, n.cuerpo, enFecha(dia, noche.h, noche.m), { ruta: '/tareas' });
        }
        if (onDomingo && weekdayMonFirst(dia) === 7) {
          // Resumen con los datos de esa semana (los que hay hasta ahora).
          const semana = rangoSemana(dia);
          const d = mensajeDomingo({
            tareas: await completadasEnRango(db, semana.desde, semana.hasta),
            gym: await diasEntrenados(db, semana),
            gasto: await totalEnRango(db, semana),
            gastoAnterior: await totalEnRango(db, rangoSemanaAnterior(dia)),
            pedirRespaldo: await necesitaRespaldo(db),
          });
          await agendar(d.titulo, d.cuerpo, enFecha(dia, domingo.h, domingo.m), { ruta: '/' });
        }
        if (onFijos) {
          // Aviso un día antes de cada gasto fijo, a la hora de la mañana.
          const manianaDe = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
          for (const f of await fijosQueVencenEn(db, manianaDe)) {
            const g = mensajeGastoFijo({ nombre: f.name, monto: f.amount });
            await agendar(g.titulo, g.cuerpo, enFecha(dia, manana.h, manana.m + 1), { ruta: '/gastos' });
          }
        }
      }

      // Si no abres la app en una semana, un último aviso para que vuelvas.
      const finDeAgenda = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + DIAS_ADELANTE, 12, 0);
      await agendar('¿Me olvidaste? 🥲', 'Abre Tinzit0 un ratito para que pueda seguir avisándote tus cosas.', finDeAgenda);
    } catch (e) {
      console.warn('No se pudieron programar las notificaciones', e);
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

export async function notificacionDePrueba() {
  if (!(await prepararNotificaciones(true))) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: MENSAJE_PRUEBA.titulo, body: MENSAJE_PRUEBA.cuerpo },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: CANAL },
  });
  return true;
}
