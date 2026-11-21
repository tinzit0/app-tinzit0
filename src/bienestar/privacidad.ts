/**
 * Privacidad extra para Bienestar: si activas "Pedir huella", la tarjeta diaria y
 * tus patrones piden la huella al entrar (y quedan abiertos 5 minutos).
 * La pantalla de calma y el plan de crisis NUNCA piden huella: en una crisis tienen que abrir al tiro.
 */
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { autenticar } from '@/components/LockGate';
import { getSetting } from '@/database/queries';

const ABIERTO_MS = 5 * 60_000;
let abiertoHasta = 0;

export function useCandadoBienestar() {
  const db = useSQLiteContext();
  const [estado, setEstado] = useState<'revisando' | 'abierto' | 'cerrado'>('revisando');

  const abrir = useCallback(async () => {
    let ok = false;
    try {
      ok = await autenticar('Abre tu espacio de Bienestar');
    } catch {
      ok = true; // si el celular no tiene huella configurada, no te dejamos afuera
    }
    if (ok) abiertoHasta = Date.now() + ABIERTO_MS;
    setEstado(ok ? 'abierto' : 'cerrado');
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const pide = (await getSetting(db, 'bienestar_bloqueo')) === '1';
        if (!pide || Date.now() < abiertoHasta) {
          if (pide) abiertoHasta = Date.now() + ABIERTO_MS;
          setEstado('abierto');
          return;
        }
        setEstado('cerrado');
        await abrir();
      })().catch(() => setEstado('abierto'));
    }, [db, abrir]),
  );

  return { estado, abrir };
}
