/**
 * Spotify dentro de Tinzit0. Dos niveles, ambos GRATIS:
 *
 * NIVEL 1 — sin configurar nada:
 *   "pon Bad Bunny", "reproduce música para entrenar"… → le pedimos a Android
 *   que Spotify reproduzca esa búsqueda (la misma orden que usa el Asistente de
 *   Google). Spotify suena solo; puedes volver a Tinzit0.
 *
 * NIVEL 2 — conectando tu cuenta (Client ID gratis de developer.spotify.com):
 *   - Ver qué está sonando (canción, artista, portada, progreso) dentro de la app.
 *   - Buscar canciones, artistas y playlists, y ver tus playlists.
 *   - Controlar pausa / siguiente / anterior y reproducir algo puntual:
 *     esto lo permite Spotify SOLO con cuenta Premium. Con cuenta gratis,
 *     al tocar una canción la abrimos en Spotify.
 *
 * Los tokens se guardan cifrados en el celular (expo-secure-store).
 */
import * as AuthSession from 'expo-auth-session';
import * as IntentLauncher from 'expo-intent-launcher';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { fetchConLimite } from '@/utils/red';
import { Linking, Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const API = 'https://api.spotify.com/v1';
const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'user-read-private',
];
const K = { clientId: 'spotify_client_id', tokens: 'spotify_tokens' };

/** Dirección a la que Spotify vuelve tras iniciar sesión (hay que registrarla en el panel de Spotify). */
export const REDIRECT_URI = AuthSession.makeRedirectUri({ scheme: 'tinzit0', path: 'spotify' });

type Tokens = { accessToken: string; refreshToken?: string; expiraEn: number };

export type Cancion = {
  id: string;
  uri: string;
  nombre: string;
  artistas: string;
  imagen: string | null;
  duracionMs: number;
};
export type Sonando = Cancion & { reproduciendo: boolean; progresoMs: number; dispositivo: string | null };
export type ResultadoBusqueda = {
  canciones: Cancion[];
  playlists: { id: string; uri: string; nombre: string; imagen: string | null; dueno: string }[];
  artistas: { id: string; uri: string; nombre: string; imagen: string | null }[];
};

// ---------- NIVEL 1: reproducir sin cuenta ----------

/** Pide a Spotify reproducir una búsqueda ("bad bunny", "lofi para estudiar"). */
export async function reproducirBusqueda(consulta: string): Promise<'reproduciendo' | 'abierto'> {
  if (Platform.OS === 'android') {
    // Igual que "Ok Google, pon X en Spotify": Spotify reproduce el mejor resultado.
    // La promesa de Android recién termina cuando vuelves a Tinzit0, así que solo
    // esperamos 1,5 s para ver si falló al tiro (por ejemplo, sin app de música).
    const intento = IntentLauncher.startActivityAsync('android.media.action.MEDIA_PLAY_FROM_SEARCH', {
      extra: { query: consulta, 'android.intent.extra.focus': 'vnd.android.cursor.item/*' },
    }).then(
      () => 'ok' as const,
      () => 'error' as const,
    );
    const r = await Promise.race([intento, new Promise<'ok'>((res) => setTimeout(() => res('ok'), 1500))]);
    if (r === 'ok') return 'reproduciendo';
  }
  await Linking.openURL(`spotify:search:${encodeURIComponent(consulta)}`).catch(() =>
    Linking.openURL(`https://open.spotify.com/search/${encodeURIComponent(consulta)}`),
  );
  return 'abierto';
}

/** Abre una canción / playlist en la app de Spotify. */
export async function abrirEnSpotify(uri: string) {
  await Linking.openURL(uri).catch(() => Linking.openURL(`https://open.spotify.com/${uri.split(':').slice(1).join('/')}`));
}

// ---------- NIVEL 2: cuenta conectada ----------

export async function obtenerClientId() {
  return SecureStore.getItemAsync(K.clientId).catch(() => null);
}
export async function guardarClientId(id: string) {
  await SecureStore.setItemAsync(K.clientId, id.trim());
}

async function leerTokens(): Promise<Tokens | null> {
  const raw = await SecureStore.getItemAsync(K.tokens).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}
async function guardarTokens(t: AuthSession.TokenResponse, anterior?: Tokens | null) {
  const tokens: Tokens = {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken ?? anterior?.refreshToken,
    expiraEn: Date.now() + (t.expiresIn ?? 3600) * 1000 - 60_000,
  };
  await SecureStore.setItemAsync(K.tokens, JSON.stringify(tokens));
  return tokens;
}

export async function conectado() {
  return !!(await leerTokens());
}

/** Abre el inicio de sesión de Spotify. Devuelve true si quedó conectado. */
export async function conectar(): Promise<boolean> {
  const clientId = await obtenerClientId();
  if (!clientId) throw new Error('Falta el Client ID de Spotify.');
  const req = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });
  const res = await req.promptAsync(DISCOVERY);
  if (res.type !== 'success' || !res.params.code) return false;
  const t = await AuthSession.exchangeCodeAsync(
    { clientId, code: res.params.code, redirectUri: REDIRECT_URI, extraParams: { code_verifier: req.codeVerifier ?? '' } },
    DISCOVERY,
  );
  await guardarTokens(t);
  return true;
}

export async function desconectar() {
  await SecureStore.deleteItemAsync(K.tokens).catch(() => {});
}

async function tokenValido(): Promise<string | null> {
  const t = await leerTokens();
  if (!t) return null;
  if (Date.now() < t.expiraEn) return t.accessToken;
  const clientId = await obtenerClientId();
  if (!clientId || !t.refreshToken) return null;
  try {
    const nuevo = await AuthSession.refreshAsync({ clientId, refreshToken: t.refreshToken }, DISCOVERY);
    return (await guardarTokens(nuevo, t)).accessToken;
  } catch {
    return null;
  }
}

export class ErrorSpotify extends Error {
  constructor(
    public codigo: 'sin_cuenta' | 'premium' | 'sin_dispositivo' | 'red' | 'otro',
    msg: string,
  ) {
    super(msg);
  }
}

async function api<T>(ruta: string, init: RequestInit = {}): Promise<T | null> {
  const token = await tokenValido();
  if (!token) throw new ErrorSpotify('sin_cuenta', 'Conecta tu cuenta de Spotify en Ajustes.');
  let r: Response;
  try {
    r = await fetchConLimite(`${API}${ruta}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw new ErrorSpotify('red', 'Sin conexión con Spotify.');
  }
  if (r.status === 204) return null;
  if (r.status === 401) {
    await desconectar();
    throw new ErrorSpotify('sin_cuenta', 'La sesión de Spotify venció. Vuelve a conectar tu cuenta.');
  }
  if (r.status === 403) throw new ErrorSpotify('premium', 'Spotify solo permite controlar la reproducción con cuenta Premium.');
  if (r.status === 404 && ruta.startsWith('/me/player')) throw new ErrorSpotify('sin_dispositivo', 'Abre Spotify en tu celular para que tenga un dispositivo activo.');
  if (!r.ok) throw new ErrorSpotify('otro', `Spotify respondió ${r.status}.`);
  const txt = await r.text();
  return txt ? (JSON.parse(txt) as T) : null;
}

type ItemApi = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists?: { name: string }[];
  album?: { images?: { url: string }[] };
};
const aCancion = (i: ItemApi): Cancion => ({
  id: i.id,
  uri: i.uri,
  nombre: i.name,
  artistas: (i.artists ?? []).map((a) => a.name).join(', '),
  imagen: i.album?.images?.[0]?.url ?? null,
  duracionMs: i.duration_ms,
});

export async function esPremium() {
  const me = await api<{ product?: string }>('/me');
  return me?.product === 'premium';
}

export async function queSuena(): Promise<Sonando | null> {
  const r = await api<{ is_playing: boolean; progress_ms: number; item: ItemApi | null; device?: { name: string } }>('/me/player?additional_types=track');
  if (!r?.item) return null;
  return { ...aCancion(r.item), reproduciendo: r.is_playing, progresoMs: r.progress_ms ?? 0, dispositivo: r.device?.name ?? null };
}

export async function buscar(q: string): Promise<ResultadoBusqueda> {
  const r = await api<{
    tracks?: { items: ItemApi[] };
    playlists?: { items: ({ id: string; uri: string; name: string; images?: { url: string }[]; owner?: { display_name?: string } } | null)[] };
    artists?: { items: { id: string; uri: string; name: string; images?: { url: string }[] }[] };
  }>(`/search?type=track,playlist,artist&limit=8&q=${encodeURIComponent(q)}`);
  return {
    canciones: (r?.tracks?.items ?? []).map(aCancion),
    playlists: (r?.playlists?.items ?? []).filter(Boolean).map((p) => ({ id: p!.id, uri: p!.uri, nombre: p!.name, imagen: p!.images?.[0]?.url ?? null, dueno: p!.owner?.display_name ?? '' })),
    artistas: (r?.artists?.items ?? []).map((a) => ({ id: a.id, uri: a.uri, nombre: a.name, imagen: a.images?.[0]?.url ?? null })),
  };
}

export async function misPlaylists() {
  const r = await api<{ items: ({ id: string; uri: string; name: string; images?: { url: string }[] } | null)[] }>('/me/playlists?limit=20');
  return (r?.items ?? []).filter(Boolean).map((p) => ({ id: p!.id, uri: p!.uri, nombre: p!.name, imagen: p!.images?.[0]?.url ?? null }));
}

// Control (Premium)
export const pausar = () => api('/me/player/pause', { method: 'PUT' });
export const continuar = () => api('/me/player/play', { method: 'PUT' });
export const siguiente = () => api('/me/player/next', { method: 'POST' });
export const anterior = () => api('/me/player/previous', { method: 'POST' });

/** Reproduce una canción o una playlist/artista. Si no hay Premium o dispositivo, la abre en Spotify. */
export async function reproducir(uri: string): Promise<'api' | 'abierto'> {
  const cuerpo = uri.includes(':track:') ? { uris: [uri] } : { context_uri: uri };
  try {
    await api('/me/player/play', { method: 'PUT', body: JSON.stringify(cuerpo) });
    return 'api';
  } catch (e) {
    if (e instanceof ErrorSpotify && (e.codigo === 'premium' || e.codigo === 'sin_dispositivo')) {
      await abrirEnSpotify(uri);
      return 'abierto';
    }
    throw e;
  }
}

/** Control por voz: si hay Premium usamos la API; si no, avisamos. */
export async function controlar(accion: 'pausa' | 'continuar' | 'siguiente' | 'anterior') {
  const f = { pausa: pausar, continuar, siguiente, anterior }[accion];
  await f();
}
