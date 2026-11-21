/**
 * Clima con Open-Meteo (https://open-meteo.com): gratis y sin API key.
 *
 * - La ubicación por defecto es Concepción (nivel ciudad). En Ajustes puedes
 *   buscar otra ciudad o usar la ubicación del celular.
 * - El pronóstico se guarda en la base de datos 30 minutos, así la app no
 *   consulta internet a cada rato y funciona sin señal con el último dato.
 * - Este archivo no usa módulos nativos: se puede probar en Node.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from '@/database/queries';

export type Ubicacion = { nombre: string; lat: number; lon: number };

export const UBICACION_DEFECTO: Ubicacion = { nombre: 'Concepción', lat: -36.827, lon: -73.0498 };

export type Pronostico = {
  ubicacion: Ubicacion;
  actualizado: number; // timestamp ms
  actual: { temp: number; sensacion: number; codigo: number; viento: number; humedad: number; esDia: boolean };
  horas: { hora: string; temp: number; codigo: number; lluvia: number }[]; // próximas 24 h
  dias: {
    fecha: string; // YYYY-MM-DD
    codigo: number;
    max: number;
    min: number;
    lluvia: number; // % probabilidad máxima
    uv: number;
    amanecer: string; // HH:MM
    atardecer: string;
  }[];
};

const VIGENCIA_MS = 30 * 60 * 1000;

// ---------- Códigos del tiempo (WMO) → texto e ícono ----------

type Info = { texto: string; icono: string; iconoNoche?: string; emoji: string };

const WMO: Record<number, Info> = {
  0: { texto: 'Despejado', icono: 'sunny', iconoNoche: 'moon', emoji: '☀️' },
  1: { texto: 'Mayormente despejado', icono: 'partly-sunny', iconoNoche: 'cloudy-night', emoji: '🌤️' },
  2: { texto: 'Parcialmente nublado', icono: 'partly-sunny', iconoNoche: 'cloudy-night', emoji: '⛅' },
  3: { texto: 'Nublado', icono: 'cloudy', emoji: '☁️' },
  45: { texto: 'Neblina', icono: 'cloudy', emoji: '🌫️' },
  48: { texto: 'Neblina', icono: 'cloudy', emoji: '🌫️' },
  51: { texto: 'Llovizna', icono: 'rainy', emoji: '🌦️' },
  53: { texto: 'Llovizna', icono: 'rainy', emoji: '🌦️' },
  55: { texto: 'Llovizna intensa', icono: 'rainy', emoji: '🌧️' },
  56: { texto: 'Llovizna helada', icono: 'rainy', emoji: '🌧️' },
  57: { texto: 'Llovizna helada', icono: 'rainy', emoji: '🌧️' },
  61: { texto: 'Lluvia débil', icono: 'rainy', emoji: '🌦️' },
  63: { texto: 'Lluvia', icono: 'rainy', emoji: '🌧️' },
  65: { texto: 'Lluvia fuerte', icono: 'rainy', emoji: '🌧️' },
  66: { texto: 'Lluvia helada', icono: 'rainy', emoji: '🌧️' },
  67: { texto: 'Lluvia helada', icono: 'rainy', emoji: '🌧️' },
  71: { texto: 'Nieve débil', icono: 'snow', emoji: '🌨️' },
  73: { texto: 'Nieve', icono: 'snow', emoji: '🌨️' },
  75: { texto: 'Nieve fuerte', icono: 'snow', emoji: '❄️' },
  77: { texto: 'Granizo fino', icono: 'snow', emoji: '🌨️' },
  80: { texto: 'Chubascos', icono: 'rainy', emoji: '🌦️' },
  81: { texto: 'Chubascos', icono: 'rainy', emoji: '🌧️' },
  82: { texto: 'Chubascos fuertes', icono: 'thunderstorm', emoji: '⛈️' },
  85: { texto: 'Chubascos de nieve', icono: 'snow', emoji: '🌨️' },
  86: { texto: 'Chubascos de nieve', icono: 'snow', emoji: '🌨️' },
  95: { texto: 'Tormenta', icono: 'thunderstorm', emoji: '⛈️' },
  96: { texto: 'Tormenta con granizo', icono: 'thunderstorm', emoji: '⛈️' },
  99: { texto: 'Tormenta con granizo', icono: 'thunderstorm', emoji: '⛈️' },
};

export function infoClima(codigo: number, esDia = true) {
  const i = WMO[codigo] ?? WMO[3];
  return { texto: i.texto, icono: !esDia && i.iconoNoche ? i.iconoNoche : i.icono, emoji: i.emoji };
}

export function esLluvia(codigo: number) {
  return (codigo >= 51 && codigo <= 67) || (codigo >= 80 && codigo <= 82) || codigo >= 95;
}

// ---------- Ubicación guardada ----------

export async function obtenerUbicacion(db: SQLiteDatabase): Promise<Ubicacion> {
  const raw = await getSetting(db, 'clima_ubicacion');
  if (!raw) return UBICACION_DEFECTO;
  try {
    const u = JSON.parse(raw) as Ubicacion;
    return Number.isFinite(u.lat) && Number.isFinite(u.lon) ? u : UBICACION_DEFECTO;
  } catch {
    return UBICACION_DEFECTO;
  }
}

export async function guardarUbicacion(db: SQLiteDatabase, u: Ubicacion) {
  // Redondeamos a ~1 km: suficiente para el clima y más privado.
  const limpia = { nombre: u.nombre, lat: Math.round(u.lat * 100) / 100, lon: Math.round(u.lon * 100) / 100 };
  await setSetting(db, 'clima_ubicacion', JSON.stringify(limpia));
  await setSetting(db, 'clima_cache', '');
}

/** Busca ciudades por nombre (para elegir en Ajustes). */
export async function buscarCiudades(texto: string): Promise<Ubicacion[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(texto)}&count=6&language=es&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo buscar la ciudad');
  const j = (await r.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
  return (j.results ?? []).map((c) => ({
    nombre: [c.name, c.admin1, c.country].filter(Boolean).join(', '),
    lat: c.latitude,
    lon: c.longitude,
  }));
}

// ---------- Pronóstico ----------

const hhmm = (iso: string) => iso.slice(11, 16);

async function descargar(u: Ubicacion): Promise<Pronostico> {
  const params = new URLSearchParams({
    latitude: String(u.lat),
    longitude: String(u.lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);
  const j = await r.json();

  // Próximas 24 horas desde la hora actual (en la zona horaria de la ubicación).
  const ahora = (j.current.time as string).slice(0, 13);
  const idx = Math.max(0, (j.hourly.time as string[]).findIndex((t) => t.slice(0, 13) >= ahora));
  const horas = (j.hourly.time as string[]).slice(idx, idx + 24).map((t, k) => ({
    hora: hhmm(t),
    temp: Math.round(j.hourly.temperature_2m[idx + k]),
    codigo: j.hourly.weather_code[idx + k],
    lluvia: j.hourly.precipitation_probability[idx + k] ?? 0,
  }));

  return {
    ubicacion: u,
    actualizado: Date.now(),
    actual: {
      temp: Math.round(j.current.temperature_2m),
      sensacion: Math.round(j.current.apparent_temperature),
      codigo: j.current.weather_code,
      viento: Math.round(j.current.wind_speed_10m),
      humedad: Math.round(j.current.relative_humidity_2m),
      esDia: j.current.is_day === 1,
    },
    horas,
    dias: (j.daily.time as string[]).map((fecha, k) => ({
      fecha,
      codigo: j.daily.weather_code[k],
      max: Math.round(j.daily.temperature_2m_max[k]),
      min: Math.round(j.daily.temperature_2m_min[k]),
      lluvia: j.daily.precipitation_probability_max[k] ?? 0,
      uv: Math.round(j.daily.uv_index_max[k] ?? 0),
      amanecer: hhmm(j.daily.sunrise[k]),
      atardecer: hhmm(j.daily.sunset[k]),
    })),
  };
}

/**
 * Devuelve el pronóstico: del caché si tiene menos de 30 min, si no lo descarga.
 * Sin internet devuelve el último guardado (aunque sea antiguo), o null.
 */
export async function obtenerClima(db: SQLiteDatabase, forzar = false): Promise<Pronostico | null> {
  const u = await obtenerUbicacion(db);
  let cache: Pronostico | null = null;
  try {
    const raw = await getSetting(db, 'clima_cache');
    cache = raw ? (JSON.parse(raw) as Pronostico) : null;
  } catch {
    cache = null;
  }
  const mismaUbicacion = cache && cache.ubicacion.lat === u.lat && cache.ubicacion.lon === u.lon;
  if (!forzar && cache && mismaUbicacion && Date.now() - cache.actualizado < VIGENCIA_MS) return cache;
  try {
    const nuevo = await descargar(u);
    await setSetting(db, 'clima_cache', JSON.stringify(nuevo));
    return nuevo;
  } catch {
    return mismaUbicacion ? cache : null;
  }
}

/** Pronóstico de un día concreto (YYYY-MM-DD), si está en los 7 días. */
export function diaDe(p: Pronostico, fecha: string) {
  return p.dias.find((d) => d.fecha === fecha) ?? null;
}

/** Texto corto para notificaciones: "☀️ 22° / 9°, 10% lluvia" */
export function resumenCorto(d: Pronostico['dias'][number]) {
  return `${infoClima(d.codigo).emoji} ${d.max}° / ${d.min}°${d.lluvia >= 30 ? `, ${d.lluvia}% de lluvia` : ''}`;
}

/** Consejo cercano según el día. */
export function consejoClima(d: Pronostico['dias'][number]): string {
  if (d.lluvia >= 60 || esLluvia(d.codigo)) return 'Lleva paraguas ☔';
  if (d.max >= 28) return 'Hidrátate harto 💧';
  if (d.uv >= 8) return 'Ojo con el sol: bloqueador 🧴';
  if (d.min <= 4) return 'Abrígate bien 🧣';
  return '';
}
