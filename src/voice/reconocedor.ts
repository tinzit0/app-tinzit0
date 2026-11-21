/**
 * Reconocimiento de voz (micrófono → texto), en español.
 *
 * IMPORTANTE: expo-speech-recognition NO viene en Expo Go. Por eso lo cargamos
 * "con cuidado": si no está (Expo Go), `vozDisponible` es false y la app sigue
 * funcionando (el chat se puede usar escribiendo). En el development build sí está.
 */
import { Alert, Platform } from 'react-native';

type Modulo = typeof import('expo-speech-recognition');
type Sub = { remove: () => void };

let mod: Modulo | null = null;
try {
  // require dentro de try: si el módulo nativo no existe, no se cae la app.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = Platform.OS === 'web' ? null : (require('expo-speech-recognition') as Modulo);
  // Forzamos a que realmente exista el módulo nativo.
  if (mod && typeof mod.ExpoSpeechRecognitionModule?.start !== 'function') mod = null;
} catch {
  mod = null;
}

/** ¿Se puede usar la voz en esta instalación? (false en Expo Go) */
export const vozDisponible = mod !== null;

export function reconocimientoListo(): boolean {
  try {
    return !!mod && mod.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/**
 * Pide permiso de micrófono. Antes de que Android muestre su ventana,
 * explicamos en español para qué es.
 */
export async function pedirPermisoMicrofono(): Promise<boolean> {
  if (!mod) return false;
  const actual = await mod.ExpoSpeechRecognitionModule.getPermissionsAsync();
  if (actual.granted) return true;
  if (!actual.canAskAgain) {
    Alert.alert(
      'Micrófono bloqueado',
      'Para hablar con Tinzit0, activa el micrófono en Ajustes del celular → Apps → Tinzit0 → Permisos.',
    );
    return false;
  }
  const seguir = await new Promise<boolean>((resolve) =>
    Alert.alert(
      'Tinzit0 quiere escucharte 🎙️',
      'Necesito el micrófono para entender lo que me pides. Solo escucho mientras ves la animación de "escuchando" (o, si lo activas, mientras la app está abierta para oír "ey Tinzit0"). Tus datos no salen del celular.',
      [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Dale', onPress: () => resolve(true) },
      ],
    ),
  );
  if (!seguir) return false;
  const r = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return r.granted;
}

export type Escucha = {
  /** Termina y entrega el resultado final. */
  detener: () => void;
  /** Cancela sin resultado. */
  cancelar: () => void;
};

type Opciones = {
  /** Modo continuo: para la palabra de activación (escucha hasta que se cancele). */
  continuo?: boolean;
  onParcial?: (texto: string) => void;
  onFinal?: (texto: string) => void;
  /** Volumen de -2 a 10 (para animar el micrófono). */
  onVolumen?: (v: number) => void;
  onFin?: () => void;
  onError?: (codigo: string) => void;
};

/** Empieza a escuchar. Devuelve cómo detener o cancelar. */
export function escuchar(op: Opciones): Escucha | null {
  if (!mod) return null;
  const M = mod.ExpoSpeechRecognitionModule;
  const subs: Sub[] = [
    M.addListener('result', (e) => {
      const texto = e.results[0]?.transcript ?? '';
      if (e.isFinal) op.onFinal?.(texto);
      else op.onParcial?.(texto);
    }),
    M.addListener('volumechange', (e) => op.onVolumen?.(e.value)),
    M.addListener('error', (e) => op.onError?.(e.error)),
    M.addListener('end', () => {
      subs.forEach((s) => s.remove());
      op.onFin?.();
    }),
  ];

  M.start({
    lang: 'es-CL',
    interimResults: true,
    continuous: !!op.continuo,
    maxAlternatives: 1,
    // Palabras que ayudan al reconocedor a entender términos de la app.
    contextualStrings: ['Tinzit0', 'tinzito', 'lucas', 'luca', 'gym', 'tarea', 'gasto'],
    volumeChangeEventOptions: { enabled: !!op.onVolumen, intervalMillis: 120 },
    androidIntentOptions: op.continuo
      ? { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500 }
      : { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1400 },
  });

  return {
    detener: () => M.stop(),
    cancelar: () => M.abort(),
  };
}
