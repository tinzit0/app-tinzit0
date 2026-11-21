/**
 * Ejecuta en el celular las "acciones" que pide el asistente:
 * navegar a una pantalla, abrir otra app (o un lugar dentro de ella), cambiar el
 * tema, programar un recordatorio y controlar la música de Spotify.
 *
 * Devuelve un texto cuando el resultado cambia lo que hay que decir
 * (por ejemplo, la canción que está sonando o "necesitas Premium").
 */
import * as Notifications from 'expo-notifications';
import type { useRouter } from 'expo-router';
import { Linking } from 'react-native';

import { abrirApp } from '@/database/apps';
import { prepararNotificaciones } from '@/notifications/programar';
import type { Accion } from './ejecutar';

type Extra = { setTema?: (t: 'light' | 'dark' | 'system') => void };

async function abrirUrl(url: string, respaldo?: string) {
  try {
    await Linking.openURL(url);
  } catch {
    if (respaldo) await Linking.openURL(respaldo).catch(() => {});
  }
}

export async function ejecutarAccion(a: Accion, router: ReturnType<typeof useRouter>, extra: Extra = {}): Promise<string | void> {
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
    case 'url':
      setTimeout(() => {
        abrirUrl(a.url, a.respaldo).catch(() => {});
      }, 600);
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

    // ---------- Música ----------
    case 'musica': {
      const sp = await import('@/spotify/spotify');
      // Con cuenta conectada (y Premium) reproducimos el mejor resultado sin salir de Tinzit0.
      if (await sp.conectado()) {
        try {
          const r = await sp.buscar(a.consulta);
          const top = r.canciones[0] ?? r.playlists[0] ?? r.artistas[0];
          if (top) {
            const como = await sp.reproducir(top.uri);
            const c = r.canciones[0];
            const nombre = c ? `${c.nombre} de ${c.artistas}` : top.nombre;
            return como === 'api' ? `Reproduciendo ${nombre}.` : `Abriendo ${nombre} en Spotify.`;
          }
        } catch {
          // seguimos con el método sin cuenta
        }
      }
      const r = await sp.reproducirBusqueda(a.consulta);
      return r === 'reproduciendo' ? undefined : `Abrí Spotify con la búsqueda "${a.consulta}".`;
    }
    case 'musica_control': {
      const sp = await import('@/spotify/spotify');
      if (!(await sp.conectado())) return 'Para controlar la música desde aquí, conecta tu cuenta de Spotify en Ajustes → Música.';
      try {
        await sp.controlar(a.accion);
        return;
      } catch (e) {
        return e instanceof sp.ErrorSpotify ? e.message : 'No pude controlar Spotify ahora.';
      }
    }
    case 'musica_sonando': {
      const sp = await import('@/spotify/spotify');
      if (!(await sp.conectado())) return 'Para saber qué suena, conecta tu cuenta de Spotify en Ajustes → Música.';
      try {
        const s = await sp.queSuena();
        if (!s) return 'Ahora no está sonando nada en Spotify.';
        return `${s.reproduciendo ? 'Está sonando' : 'Quedó en pausa'} ${s.nombre}, de ${s.artistas}.`;
      } catch (e) {
        return e instanceof sp.ErrorSpotify ? e.message : 'No pude revisar Spotify ahora.';
      }
    }
  }
}
