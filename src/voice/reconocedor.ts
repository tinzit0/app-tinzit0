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

// Los eventos del reconocedor son globales: si quedara un "oyente" de una escucha
// anterior, también recibiría tus palabras. Cada escucha tiene un número y los
// oyentes viejos ignoran todo lo que no sea suyo.
let sesionActual = 0;

/**
 * Empieza a escuchar. Devuelve cómo detener o cancelar.
 *
 * IMPORTANTE (Samsung y otros Android): a veces el reconocedor muestra la
 * transcripción parcial pero termina sin entregar el "resultado final"
 * (llega "sin coincidencias" o un error). Para no perder lo que dijiste,
 * guardamos el último parcial y, si al terminar no hubo final, lo usamos como final.
 */
export function escuchar(op: Opciones): Escucha | null {
  if (!mod) return null;
  const M = mod.ExpoSpeechRecognitionModule;
  const id = ++sesionActual;
  const mia = () => id === sesionActual;
  let ultimoParcial = '';
  let finalEntregado = false;
  let terminado = false;

  const entregarFinal = (texto: string) => {
    if (finalEntregado || !texto.trim()) return;
    finalEntregado = true;
    op.onFinal?.(texto.trim());
  };

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    subs.forEach((s) => s.remove());
    // Si nunca llegó el final pero sí escuchamos algo, lo usamos.
    if (!finalEntregado && ultimoParcial.trim() && !cancelado) entregarFinal(ultimoParcial);
    op.onFin?.();
  };

  let cancelado = false;
  const subs: Sub[] = [
    M.addListener('result', (e) => {
      if (!mia()) return;
      const texto = e.results[0]?.transcript ?? '';
      if (e.isFinal) {
        // En modo continuo puede haber varios finales (uno por frase).
        if (op.continuo) op.onFinal?.(texto);
        else entregarFinal(texto || ultimoParcial);
      } else if (texto) {
        ultimoParcial = texto;
        op.onParcial?.(texto);
      }
    }),
    M.addListener('volumechange', (e) => mia() && op.onVolumen?.(e.value)),
    M.addListener('error', (e) => {
      if (!mia()) return;
      // "Sin coincidencias" con algo ya transcrito no es un error para nosotros.
      if ((e.error === 'no-speech' || e.error === 'speech-timeout') && ultimoParcial.trim()) return;
      if (e.error !== 'aborted') op.onError?.(e.error);
    }),
    M.addListener('end', () => {
      if (!mia()) {
        subs.forEach((s) => s.remove());
        return;
      }
      terminar();
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
    detener: () => {
      M.stop();
      // Si Android no responde al detener, entregamos lo escuchado igual tras 2,5 s.
      setTimeout(() => mia() && !terminado && terminar(), 2500);
    },
    cancelar: () => {
      cancelado = true;
      M.abort();
    },
  };
}
