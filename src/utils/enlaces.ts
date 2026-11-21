/**
 * Enlaces que abren otras apps en el lugar justo (YouTube, Maps, WhatsApp…).
 * Si la app no está instalada, Android abre la versión web.
 */
const e = encodeURIComponent;

export const ENLACES = {
  youtube: (q: string) => `https://www.youtube.com/results?search_query=${e(q)}`,
  google: (q: string) => `https://www.google.com/search?q=${e(q)}`,
  navegar: (destino: string) => `google.navigation:q=${e(destino)}`,
  navegarWeb: (destino: string) => `https://www.google.com/maps/dir/?api=1&destination=${e(destino)}`,
  mapa: (q: string) => `geo:0,0?q=${e(q)}`,
  mapaWeb: (q: string) => `https://www.google.com/maps/search/?api=1&query=${e(q)}`,
  whatsapp: (texto: string) => `whatsapp://send?text=${e(texto)}`,
  whatsappWeb: (texto: string) => `https://wa.me/?text=${e(texto)}`,
  llamar: (numero: string) => `tel:${numero}`,
};
