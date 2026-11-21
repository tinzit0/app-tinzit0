/**
 * Escucha la frase "ey Tinzit0" MIENTRAS LA APP ESTÁ ABIERTA (si lo activas en Ajustes).
 *
 * Cómo funciona:
 * - Deja el reconocedor de voz escuchando en modo continuo.
 * - Cada frase que entiende se revisa con detectarActivacion() (acepta "tinzito",
 *   "tin zito", "tinsito", etc.).
 * - Si la detecta: vibra, abre el asistente y, si ya dijiste el comando en la
 *   misma frase ("ey tinzito qué me toca hoy"), lo responde directo.
 * - Android corta la escucha cada cierto rato; aquí la volvemos a iniciar sola.
 *
 * PREPARADO PARA EL FUTURO: la activación con la app CERRADA necesita un servicio
 * nativo en segundo plano (y probablemente Picovoice Porcupine para no gastar
 * batería). Ese código iría en un módulo aparte; esta interfaz (escuchaActiva,
 * pausarActivacion) se mantendría igual.
 */
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import { escuchar, pedirPermisoMicrofono, vozDisponible, type Escucha } from './reconocedor';
import { detectarActivacion } from './texto';

type Ctx = {
  vozDisponible: boolean;
  escuchaActiva: boolean;
  cambiarEscuchaActiva: (v: boolean) => Promise<void>;
  /** El asistente la pausa mientras está abierto (para no competir por el micrófono). */
  pausarActivacion: (pausar: boolean) => void;
};

const VozContext = createContext<Ctx>({
  vozDisponible: false,
  escuchaActiva: false,
  cambiarEscuchaActiva: async () => {},
  pausarActivacion: () => {},
});

export const useVoz = () => useContext(VozContext);

export function VozProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const [escuchaActiva, setEscuchaActiva] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [activa, setActiva] = useState(AppState.currentState === 'active');
  const escucha = useRef<Escucha | null>(null);
  const errores = useRef(0);

  useEffect(() => {
    getSetting(db, 'escucha_activa').then((v) => setEscuchaActiva(v === '1' && vozDisponible));
  }, [db]);

  useEffect(() => {
    const s = AppState.addEventListener('change', (e) => setActiva(e === 'active'));
    return () => s.remove();
  }, []);

  const debeEscuchar = escuchaActiva && !pausado && activa && vozDisponible;

  const iniciar = useCallback(() => {
    if (escucha.current) return;
    const revisar = (texto: string) => {
      const comando = detectarActivacion(texto);
      if (comando === null) return false;
      escucha.current?.cancelar();
      escucha.current = null;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      router.push({ pathname: '/asistente', params: { auto: '1', comando } });
      return true;
    };
    escucha.current = escuchar({
      continuo: true,
      onParcial: (t) => {
        revisar(t);
      },
      onFinal: (t) => {
        revisar(t);
      },
      onError: (codigo) => {
        // Sin permiso o servicio no disponible: apagamos para no insistir.
        if (codigo === 'not-allowed' || codigo === 'service-not-allowed' || codigo === 'language-not-supported') {
          setEscuchaActiva(false);
          setSetting(db, 'escucha_activa', '0').catch(() => {});
        }
        errores.current++;
      },
      onFin: () => {
        escucha.current = null;
      },
    });
  }, [db, router]);

  // Bucle: si debe escuchar y no está escuchando, (re)inicia. Con pausa creciente si hay errores.
  useEffect(() => {
    if (!debeEscuchar) {
      escucha.current?.cancelar();
      escucha.current = null;
      return;
    }
    iniciar();
    const t = setInterval(() => {
      if (!escucha.current) {
        if (errores.current > 5) errores.current = 0; // respiro
        iniciar();
      }
    }, 1500);
    return () => {
      clearInterval(t);
      escucha.current?.cancelar();
      escucha.current = null;
    };
  }, [debeEscuchar, iniciar]);

  const cambiarEscuchaActiva = async (v: boolean) => {
    if (v && !(await pedirPermisoMicrofono())) return;
    setEscuchaActiva(v);
    await setSetting(db, 'escucha_activa', v ? '1' : '0');
  };

  const pausarActivacion = useCallback((p: boolean) => setPausado(p), []);

  return (
    <VozContext.Provider value={{ vozDisponible, escuchaActiva, cambiarEscuchaActiva, pausarActivacion }}>
      {children}
    </VozContext.Provider>
  );
}
