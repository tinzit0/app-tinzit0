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
  vaciarCola(): void;
  configurarPaquetes(lista: string[]): void;
  addListener(evento: 'onAviso', cb: (e: { json: string }) => void): EventSubscription;
};

export const Avisos = requireOptionalNativeModule<Modulo>('Tinzit0Avisos');
