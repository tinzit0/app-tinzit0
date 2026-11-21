/**
 * Ejecuta en el celular las "acciones" que pide el asistente:
 * navegar a una pantalla, abrir otra app o programar un recordatorio.
 */
import * as Notifications from 'expo-notifications';
import type { useRouter } from 'expo-router';

import { abrirApp } from '@/database/apps';
import { prepararNotificaciones } from '@/notifications/programar';
import type { Accion } from './ejecutar';

export async function ejecutarAccion(
  a: Accion,
  router: ReturnType<typeof useRouter>,
  extra: { setTema?: (t: 'light' | 'dark' | 'system') => void } = {},
) {
  switch (a.tipo) {
    case 'navegar':
      // Pequeña pausa para que alcances a leer la respuesta.
      setTimeout(() => router.push(a.ruta as never), 700);
      return;
    case 'abrir_app':
      setTimeout(() => {
        abrirApp(a.pkg).catch(() => {});
      }, 700);
      return;
    case 'tema':
      extra.setTema?.(a.tema === 'claro' ? 'light' : a.tema === 'oscuro' ? 'dark' : 'system');
      return;
    case 'recordatorio':
      if (!(await prepararNotificaciones(true))) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Recordatorio',
          body: a.texto,
          sound: true,
          // "recordatorio" hace que reprogramarTodo() no lo borre.
          data: { tipo: 'recordatorio' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(5, a.segundos), channelId: 'tinzit0' },
      });
      return;
  }
}
