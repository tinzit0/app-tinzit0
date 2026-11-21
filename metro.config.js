// Configuración de Metro (el empaquetador de Expo).
// 1. Soporte web para expo-sqlite (archivos .wasm y cabeceras COOP/COEP),
//    útil para previsualizar en el navegador.
// 2. El SDK de Anthropic (@anthropic-ai/sdk) se carga en su versión CommonJS:
//    su versión ESM tiene importaciones circulares que Metro no resuelve bien
//    y la app se caería al cargarlo ("Cannot access ... before initialization").
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

const resolverOriginal = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolver = resolverOriginal ?? context.resolveRequest;
  if (moduleName === '@anthropic-ai/sdk' || moduleName.startsWith('@anthropic-ai/sdk/')) {
    return resolver({ ...context, isESMImport: false, unstable_conditionNames: ['require', 'default'] }, moduleName, platform);
  }
  return resolver(context, moduleName, platform);
};

config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
