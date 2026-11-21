/**
 * Módulo nativo propio (solo Android): lee los avisos de las apps de bancos.
 * Si no existe (Expo Go, web), `Avisos` es null y la app sigue funcionando.
 */
import { requireOptionalNativeModule, type EventSubscription } from 'expo';

type Modulo = {
  tienePermiso(): boolean;
  abrirAjustesPermiso(): void;
  abrirInfoApp(): void;
  leerCola(): string;
  /** Quita de la cola solo los avisos ya guardados. Devuelve cuántos quitó. */
  confirmarCola(procesadosJson: string): number;
  /** Borra toda la cola (solo para casos manuales; NO usar al sincronizar). */
  vaciarCola(): void;
  configurarPaquetes(lista: string[]): void;
  addListener(evento: 'onAviso', cb: (e: { json: string }) => void): EventSubscription;
};

export const Avisos = requireOptionalNativeModule<Modulo>('Tinzit0Avisos');
