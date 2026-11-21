/**
 * Tareas "de fondo" que corren al abrir la app y al salir de ella:
 * - Pide permiso de notificaciones la primera vez.
 * - Suma los gastos fijos que ya tocaron este mes.
 * - Reprograma las notificaciones con los datos al día.
 * - Actualiza el widget de la pantalla de inicio.
 * - Si tocas una notificación, te lleva a la pantalla correspondiente.
 * No dibuja nada en pantalla.
 */
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { aplicarFijosDelMes } from '@/database/fijos';
import { prepararNotificaciones, reprogramarTodo } from '@/notifications/programar';
import { actualizarWidget } from '@/widget';

export function AppLifecycle() {
  const db = useSQLiteContext();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const alDia = async () => {
      await aplicarFijosDelMes(db).catch(console.warn);
      await reprogramarTodo(db);
      await actualizarWidget(db);
    };

    prepararNotificaciones(true)
      .then(alDia)
      .catch(console.warn);

    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' || estado === 'background') alDia().catch(console.warn);
    });

    // Tocar una notificación abre la pantalla que corresponde.
    const toque = Notifications.addNotificationResponseReceivedListener((r) => {
      const ruta = r.notification.request.content.data?.ruta;
      if (typeof ruta === 'string' && ruta.startsWith('/')) {
        router.navigate(ruta as never);
      }
    });

    return () => {
      sub.remove();
      toque.remove();
    };
  }, [db, router]);

  return null;
}
