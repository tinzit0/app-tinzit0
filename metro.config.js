// Configuración de Metro (el empaquetador de Expo).
// Solo agrega soporte web para expo-sqlite (archivos .wasm y cabeceras COOP/COEP),
// útil para previsualizar en el navegador. En el celular no cambia nada.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');


config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
