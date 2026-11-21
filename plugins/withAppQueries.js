// Plugin de configuración (solo afecta al development build / app instalada).
// Android 11+ esconde las demás apps a menos que las declares en <queries>.
// Aquí declaramos las apps del catálogo "Tus apps" para poder abrirlas
// por su paquete y mostrar su ícono real.
const { withAndroidManifest } = require('expo/config-plugins');

const PAQUETES = [
  'com.whatsapp', 'com.instagram.android', 'com.spotify.music', 'com.google.android.youtube',
  'com.google.android.gm', 'com.google.android.apps.maps', 'com.zhiliaoapp.musically',
  'com.twitter.android', 'org.telegram.messenger', 'com.discord', 'com.facebook.katana',
  'com.ubercab', 'com.google.android.apps.docs', 'com.android.chrome', 'com.linkedin.android',
  'com.mercadopago.wallet', 'com.pedidosya', 'com.netflix.mediaclient',
  'com.google.android.calendar', 'com.google.android.apps.photos',
];

module.exports = function withAppQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.queries = manifest.queries || [];
    const yaEstan = new Set(
      manifest.queries.flatMap((q) => (q.package || []).map((p) => p.$['android:name'])),
    );
    const nuevos = PAQUETES.filter((p) => !yaEstan.has(p)).map((p) => ({ $: { 'android:name': p } }));
    if (nuevos.length) manifest.queries.push({ package: nuevos });
    return config;
  });
};
