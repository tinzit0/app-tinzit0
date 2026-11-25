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
import { AndroidImportance } from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { rangoSemana, rangoSemanaAnterior, totalEnRango } from '@/database/gastos';
import { fijosQueVencenEn } from '@/database/fijos';
import { diasEntrenados, rutinaDeHoy } from '@/database/gym';
import { getSetting } from '@/database/queries';
import { necesitaRespaldo } from '@/database/respaldo';
import { minutosEstudio, nombreTipo, proximasEvaluaciones, todosLosBloques } from '@/database/estudio';
import { asistenciaAutoActiva, visitaAbierta } from '@/database/campus';
import { obtenerProyeccion } from '@/database/finanzas';
import { completadasEnRango, momentoAlarma, tareasDelDia } from '@/database/tareas';
import { consejoClima, diaDe, obtenerClima, resumenCorto } from '@/clima/clima';
import { toISODate, weekdayMonFirst } from '@/utils/fechas';
import { conLimite } from '@/utils/red';
import { datosBienestar, obtenerTarjeta } from '@/database/bienestar';
import { diaDificil } from '@/bienestar/logica';
import { mensajeApoyo, mensajeTarea, mensajeTarjeta, mensajeClase, mensajePreguntaAsistencia, mensajeDomingo, mensajeGastoFijo, mensajeManana, mensajeNoche, mensajePrueba, MENSAJE_PRUEBA } from './mensajes';

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
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#CFF56B',
    });
    // Botones de la pregunta "¿Fuiste a …?" (abren la app y anotan).
    await Notifications.setNotificationCategoryAsync('asistencia', [
      { identifier: 'fui', buttonTitle: 'Fui ✓', options: { opensAppToForeground: true } },
      { identifier: 'falte', buttonTitle: 'Falté', options: { opensAppToForeground: true } },
    ]).catch(() => {});
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
      // Borramos solo los avisos "de agenda". El temporizador de descanso y los recordatorios por voz se respetan
      // (si no, al salir de la app durante el descanso, la alarma desaparecería).
      const agendadas = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        agendadas
          .filter((n) => !['descanso', 'recordatorio', 'pomodoro'].includes(String(n.content.data?.tipo ?? '')))
          .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
      );

      const on = async (k: string) => (await getSetting(db, k)) !== '0';
      const nombre = (await getSetting(db, 'nombre')) ?? '';
      const manana = leerHora(await getSetting(db, 'hora_manana'), '08:00');
      const noche = leerHora(await getSetting(db, 'hora_noche'), '21:30');
      const domingo = leerHora(await getSetting(db, 'hora_domingo'), '20:00');
      const [onManana, onNoche, onDomingo, onFijos, onClases, onPruebas] = await Promise.all([
        on('notif_manana'),
        on('notif_noche'),
        on('notif_domingo'),
        on('notif_fijos'),
        on('notif_clases'),
        on('notif_pruebas'),
      ]);
      const onTareas = await on('notif_tareas');
      const avisoClase = Number((await getSetting(db, 'aviso_clase_min')) ?? 10) || 10;
      const bloques = onClases ? await todosLosBloques(db) : [];
      const pruebas = (await proximasEvaluaciones(db, DIAS_ADELANTE + 1)).filter((e) => e.grade == null);
      // Asistencia automática: pregunta "¿fuiste?" al terminar cada clase, salvo que ya sepamos.
      const autoAsis = await asistenciaAutoActiva(db);
      const bloquesAsis = autoAsis ? await todosLosBloques(db) : [];
      const enLaU = autoAsis ? (await visitaAbierta(db)) !== null : false;
      const asistencias = autoAsis
        ? new Set((await db.getAllAsync<{ course_id: number; date: string }>('SELECT course_id, date FROM attendance WHERE date >= ?', toISODate())).map((a) => `${a.course_id}|${a.date}`))
        : new Set<string>();
      // Cuánto puedes gastar por día (para el resumen de la mañana).
      const proy = await obtenerProyeccion(db).catch(() => null);
      const presSemanal = Number((await getSetting(db, 'presupuesto_semanal')) ?? 0) || 0;
      const gastoSemanaHoy = proy?.porDia != null ? presSemanal - proy.porDia * proy.diasRestantesSemana : 0;

      // Bienestar: recordatorio para la tarjeta y un mensaje de apoyo el día de la semana que más te cuesta.
      const onTarjeta = await on('notif_tarjeta');
      const horaTarjeta = leerHora(await getSetting(db, 'hora_tarjeta'), '22:00');
      const tarjetaHoy = await obtenerTarjeta(db).catch(() => null);
      const diaApoyo = diaDificil(await datosBienestar(db, 60).catch(() => []));

      // Pronóstico de 7 días (del caché o de internet). Si no hay conexión, las notificaciones van sin clima.
      // Máximo 4 s: sin internet (o lento) las notificaciones se agendan igual, sin clima.
      const pronostico = await conLimite(obtenerClima(db), 4000, null);

      const hoy = new Date();
      for (let i = 0; i < DIAS_ADELANTE; i++) {
        const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
        const iso = toISODate(dia);
        const tareas = await tareasDelDia(db, iso);
        const pendientes = tareas.filter((t) => !t.hecha).length;

        // Alarmas de tareas con hora (las atrasadas de días anteriores no vuelven a sonar).
        if (onTareas) {
          for (const t of tareas.filter((x) => !x.hecha && !x.atrasada)) {
            const cuando = momentoAlarma(iso, t);
            if (!cuando) continue;
            const a = mensajeTarea({ titulo: t.title, hora: t.due_time!, minutos: t.remind_min ?? 0 });
            await agendar(a.titulo, a.cuerpo, cuando, { ruta: `/tarea?id=${t.id}`, tipo: 'tarea' });
          }
        }

        if (onManana) {
          const gym = await rutinaDeHoy(db, dia);
          const d = pronostico ? diaDe(pronostico, iso) : null;
          const clima = d ? `${resumenCorto(d)}${consejoClima(d) ? ` · ${consejoClima(d)}` : ''}` : null;
          // Mismo lunes-domingo que hoy: lo que queda repartido en los días que faltan; semana nueva: presupuesto / 7.
          const mismaSemana = i < 8 - weekdayMonFirst(hoy);
          const gastoDia = presSemanal > 0 ? Math.max(0, Math.floor(mismaSemana ? (presSemanal - gastoSemanaHoy) / (8 - weekdayMonFirst(dia)) : presSemanal / 7)) : null;
          const m = mensajeManana({ nombre, tareas: pendientes, gym, clima, gastoDia });
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
            estudioMin: (await minutosEstudio(db, semana.desde, semana.hasta)).total,
            pruebasProximas: pruebas.filter((e) => e.date && e.date > iso && e.date <= toISODate(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 7))).length,
          });
          await agendar(d.titulo, d.cuerpo, enFecha(dia, domingo.h, domingo.m), { ruta: '/' });
        }
        if (onTarjeta && !(i === 0 && tarjetaHoy?.animo != null)) {
          const t = mensajeTarjeta();
          await agendar(t.titulo, t.cuerpo, enFecha(dia, horaTarjeta.h, horaTarjeta.m), { ruta: '/tarjeta-diaria' });
        }
        if (diaApoyo != null && dia.getDay() === diaApoyo) {
          const a = mensajeApoyo({ nombre });
          await agendar(a.titulo, a.cuerpo, enFecha(dia, 12, 0), { ruta: '/bienestar' });
        }
        // Clases: un aviso unos minutos antes de cada bloque.
        for (const b of bloques.filter((x) => x.weekday === weekdayMonFirst(dia))) {
          const [h, m] = b.start_time.split(':').map(Number);
          const c = mensajeClase({ ramo: b.name, sala: b.sala, minutos: avisoClase, hora: b.start_time, tipo: nombreTipo(b.kind) });
          await agendar(c.titulo, c.cuerpo, enFecha(dia, h, m - avisoClase), { ruta: '/horario' });
        }
        // ¿Fuiste? — 5 min después de cada clase sin asistencia registrada.
        if (autoAsis && !(i === 0 && enLaU)) {
          for (const b of bloquesAsis.filter((x) => x.weekday === weekdayMonFirst(dia))) {
            if (asistencias.has(`${b.course_id}|${iso}`)) continue;
            const [h, m] = b.end_time.split(':').map(Number);
            const cuando = enFecha(dia, h, m + 5);
            if (cuando.getTime() <= Date.now() + 30_000) continue;
            const q = mensajePreguntaAsistencia({ ramo: b.name });
            await Notifications.scheduleNotificationAsync({
              content: { title: q.titulo, body: q.cuerpo, categoryIdentifier: 'asistencia', data: { tipo: 'asistencia', courseId: String(b.course_id), fecha: iso, ruta: `/ramo?id=${b.course_id}` } },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: cuando, channelId: CANAL },
            });
          }
        }
        // Pruebas: la noche anterior y la mañana del día.
        if (onPruebas) {
          const manianaIso = toISODate(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1));
          for (const e of pruebas.filter((x) => x.date === manianaIso)) {
            const p = mensajePrueba({ nombre: e.name, ramo: e.ramo, manana: true });
            await agendar(p.titulo, p.cuerpo, enFecha(dia, noche.h, noche.m + 2), { ruta: '/estudio' });
          }
          for (const e of pruebas.filter((x) => x.date === iso)) {
            const p = mensajePrueba({ nombre: e.name, ramo: e.ramo, manana: false });
            await agendar(p.titulo, p.cuerpo, enFecha(dia, manana.h, manana.m + 2), { ruta: '/estudio' });
          }
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

/** "✓ Asistencia marcada en Cálculo" (lo usa la tarea de ubicación). */
export async function avisoAsistenciaMarcada(ramos: string[]) {
  if (!ramos.length || !(await prepararNotificaciones(false))) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: '✓ Asistencia marcada', body: `Te detecté en la U: ${ramos.join(', ')}.`, data: { tipo: 'recordatorio', ruta: '/estudio' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: CANAL },
  });
}

