// Lint del proyecto (configuración base de Expo). Correr: npm run lint
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Carpetas generadas o de herramientas: no son código de la app.
    ignores: ['dist/*', 'web-build/*', '.expo/*', 'android/*', 'ios/*', '.playwright-mcp/*', 'node_modules/*'],
  },
]);
