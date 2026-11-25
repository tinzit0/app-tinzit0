/**
 * Tareas "de fondo" que corren al abrir la app y al salir de ella:
 * - Pide permiso de notificaciones la primera vez.
 * - Suma los gastos fijos que ya tocaron este mes.
 * - Pasa a gastos los avisos de compra del banco (si activaste los gastos automáticos).
 * - Marca la asistencia de las clases en las que estuviste (asistencia automática).
 * - Reprograma las notificaciones con los datos al día.
 * - Actualiza el widget de la pantalla de inicio.
 * - Si tocas una notificación, te lleva a la pantalla correspondiente
 *   (y los botones "Fui"/"Falté" anotan tu asistencia).
 * No dibuja nada en pantalla.
 */
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { conciliarAsistencia } from '@/database/campus';
import { marcarAsistencia } from '@/database/estudio';
import { aplicarFijosDelMes } from '@/database/fijos';
import { getSetting, setSetting } from '@/database/queries';
import { escucharAvisos, sincronizarAvisos } from '@/finanzas/sincronizar';
import { prepararNotificaciones, reprogramarTodo } from '@/notifications/programar';
import { sincronizarEnSegundoPlano } from '@/nube/sincronizar';
import { actualizarWidget } from '@/widget';

export function AppLifecycle() {
  const db = useSQLiteContext();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Una sola pasada a la vez: si se pide otra mientras corre (abrir/salir rápido),
    // se hace UNA más al terminar, en vez de dos en paralelo.
    let corriendo = false;
    let otraVez = false;
    const alDia = async () => {
      if (corriendo) {
        otraVez = true;
        return;
      }
      corriendo = true;
      try {
        do {
          otraVez = false;
          await aplicarFijosDelMes(db).catch(console.warn);
          await sincronizarAvisos(db).catch(console.warn);
          await conciliarAsistencia(db).catch(console.warn);
          await reprogramarTodo(db).catch(console.warn);
          await actualizarWidget(db).catch(console.warn);
          // Con cuenta: check-ins de las rachas y respaldo en la nube (si no hay internet, queda para después).
          await sincronizarEnSegundoPlano(db).catch(() => {});
        } while (otraVez);
      } finally {
        corriendo = false;
      }
    };

    prepararNotificaciones(true)
      .then(alDia)
      .catch(console.warn);

    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' || estado === 'background') alDia().catch(console.warn);
    });

    // Avisos del banco que llegan con la app abierta: se procesan al tiro.
    const dejarAvisos = escucharAvisos(() => {
      sincronizarAvisos(db).catch(console.warn);
    });

    // Respuesta a una notificación (toque o botón). Se recuerda la última para no procesarla dos veces.
    const responder = async (r: Notifications.NotificationResponse) => {
      const clave = `${r.notification.request.identifier}|${r.actionIdentifier}|${r.notification.date}`;
      if ((await getSetting(db, 'ultima_respuesta_notif')) === clave) return;
      await setSetting(db, 'ultima_respuesta_notif', clave);
      const data = r.notification.request.content.data ?? {};
      if (data.tipo === 'asistencia' && (r.actionIdentifier === 'fui' || r.actionIdentifier === 'falte')) {
        const curso = Number(data.courseId);
        if (curso) await marcarAsistencia(db, curso, r.actionIdentifier === 'fui', String(data.fecha ?? ''));
      }
      const ruta = data.ruta;
      if (typeof ruta === 'string' && ruta.startsWith('/')) router.navigate(ruta as never);
    };
    const toque = Notifications.addNotificationResponseReceivedListener((r) => {
      responder(r).catch(console.warn);
    });
    // Si la app estaba cerrada y se abrió desde una notificación.
    Notifications.getLastNotificationResponseAsync()
      .then((r) => r && responder(r))
      .catch(() => {});

    return () => {
      sub.remove();
      toque.remove();
      dejarAvisos();
    };
  }, [db, router]);

  return null;
}
