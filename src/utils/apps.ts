/**
 * Catálogo de apps para el apartado "Tus apps" de la pantalla Hoy.
 * En Android cada app se identifica por su "paquete" (ej: com.whatsapp),
 * que es como el celular sabe cuál abrir.
 * Si la app no está instalada, se abre su página en Google Play.
 */
export type AppCatalogo = {
  pkg: string;
  label: string;
  /** Ícono de respaldo (FontAwesome 6 "brands") por si no se puede leer el ícono real. */
  icon: string;
  color: string;
  /** Enlace propio de la app (plan B si no se puede abrir por paquete). */
  scheme?: string;
};

export const CATALOGO_APPS: AppCatalogo[] = [
  { pkg: 'com.whatsapp', scheme: 'whatsapp://send', label: 'WhatsApp', icon: 'whatsapp', color: '#25D366' },
  { pkg: 'com.instagram.android', scheme: 'instagram://app', label: 'Instagram', icon: 'instagram', color: '#E1306C' },
  { pkg: 'com.spotify.music', scheme: 'spotify:', label: 'Spotify', icon: 'spotify', color: '#1DB954' },
  { pkg: 'com.google.android.youtube', scheme: 'vnd.youtube:', label: 'YouTube', icon: 'youtube', color: '#FF0033' },
  { pkg: 'com.google.android.gm', scheme: 'googlegmail://', label: 'Gmail', icon: 'google', color: '#EA4335' },
  { pkg: 'com.google.android.apps.maps', scheme: 'geo:0,0?q=', label: 'Maps', icon: 'google', color: '#34A853' },
  { pkg: 'com.zhiliaoapp.musically', scheme: 'snssdk1233://', label: 'TikTok', icon: 'tiktok', color: '#111111' },
  { pkg: 'com.twitter.android', scheme: 'twitter://timeline', label: 'X', icon: 'x-twitter', color: '#111111' },
  { pkg: 'org.telegram.messenger', scheme: 'tg://', label: 'Telegram', icon: 'telegram', color: '#229ED9' },
  { pkg: 'com.discord', scheme: 'discord://', label: 'Discord', icon: 'discord', color: '#5865F2' },
  { pkg: 'com.facebook.katana', scheme: 'fb://feed', label: 'Facebook', icon: 'facebook', color: '#1877F2' },
  { pkg: 'com.ubercab', scheme: 'uber://', label: 'Uber', icon: 'uber', color: '#111111' },
  { pkg: 'com.google.android.apps.docs', label: 'Drive', icon: 'google-drive', color: '#1FA463' },
  { pkg: 'com.android.chrome', scheme: 'googlechrome://', label: 'Chrome', icon: 'chrome', color: '#4285F4' },
  { pkg: 'com.linkedin.android', scheme: 'linkedin://', label: 'LinkedIn', icon: 'linkedin', color: '#0A66C2' },
  { pkg: 'com.mercadopago.wallet', scheme: 'mercadopago://', label: 'Mercado Pago', icon: 'wallet', color: '#00B1EA' },
  { pkg: 'com.pedidosya', label: 'PedidosYa', icon: 'utensils', color: '#FA0050' },
  { pkg: 'com.netflix.mediaclient', scheme: 'nflx://', label: 'Netflix', icon: 'film', color: '#E50914' },
  { pkg: 'com.google.android.calendar', label: 'Calendario', icon: 'calendar', color: '#4285F4' },
  { pkg: 'com.google.android.apps.photos', label: 'Fotos', icon: 'images', color: '#FBBC04' },
];

/** Íconos que NO son de marca (están en el estilo "solid"). */
export const ICONOS_SOLIDOS = new Set(['wallet', 'utensils', 'film', 'calendar', 'images']);

export const MAX_APPS = 8;
