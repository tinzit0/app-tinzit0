/**
 * Carga "con cuidado" la librería de widgets.
 * En Expo Go no existe el módulo nativo y la librería se cae al importarla,
 * así que la pedimos dentro de un try. Si no está, el widget simplemente no hace nada.
 */
import { Platform } from 'react-native';

type Lib = typeof import('react-native-android-widget');

let cache: Lib | null | undefined;

export function widgetLib(): Lib | null {
  if (cache !== undefined) return cache;
  if (Platform.OS !== 'android') return (cache = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cache = require('react-native-android-widget') as Lib;
  } catch {
    cache = null;
  }
  return cache;
}
