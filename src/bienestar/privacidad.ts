/**
 * Privacidad extra para Bienestar: si activas "Pedir huella", la tarjeta diaria y
 * tus patrones piden la huella al entrar (y quedan abiertos 5 minutos).
 * - Un error de huella NUNCA abre (cuenta como "no").
 * - Al volver del segundo plano se revisa si ya venció el plazo.
 * - La pantalla de calma y el plan de crisis NUNCA piden huella: en una crisis tienen que abrir al tiro.
 */
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { autenticar } from '@/components/LockGate';
import { getSetting } from '@/database/queries';

const ABIERTO_MS = 5 * 60_000;
let abiertoHasta = 0;

/** ¿Bienestar sigue abierto (dentro del plazo)? Exportado para pruebas. */
export function bienestarAbierto(ahora = Date.now()): boolean {
  return ahora < abiertoHasta;
}
export function marcarBienestarAbierto(ahora = Date.now()) {
  abiertoHasta = ahora + ABIERTO_MS;
}
export function cerrarBienestar() {
  abiertoHasta = 0;
}

export function useCandadoBienestar() {
  const db = useSQLiteContext();
  const [estado, setEstado] = useState<'revisando' | 'abierto' | 'cerrado'>('revisando');

  const abrir = useCallback(async () => {
    const ok = await autenticar('Abre tu espacio de Bienestar'); // devuelve false ante cualquier error
    if (ok) marcarBienestarAbierto();
    setEstado(ok ? 'abierto' : 'cerrado');
  }, []);

  const revisar = useCallback(async () => {
    const pide = (await getSetting(db, 'bienestar_bloqueo')) === '1';
    if (!pide) {
      setEstado('abierto');
      return;
    }
    if (bienestarAbierto()) {
      marcarBienestarAbierto(); // mientras lo usas, el plazo se extiende
      setEstado('abierto');
      return;
    }
    setEstado('cerrado');
    await abrir();
  }, [db, abrir]);

  useFocusEffect(
    useCallback(() => {
      revisar().catch(() => setEstado('cerrado')); // si no se puede leer el ajuste, se queda cerrado
      // Al volver del segundo plano, si venció el plazo se tapa (sin abrir la huella sola:
      // la ventana de huella también "sale y vuelve" de la app y causaría un bucle).
      const sub = AppState.addEventListener('change', (e) => {
        if (e !== 'active') return;
        getSetting(db, 'bienestar_bloqueo')
          .then((v) => {
            if (v === '1' && !bienestarAbierto()) setEstado('cerrado');
          })
          .catch(() => setEstado('cerrado'));
      });
      return () => sub.remove();
    }, [revisar, db]),
  );

  return { estado, abrir };
}
