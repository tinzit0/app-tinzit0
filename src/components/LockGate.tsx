/**
 * Bloqueo con huella (o PIN del celular).
 *
 * Si está activado en Ajustes:
 * - Al abrir la app pide la huella.
 * - Si sales de la app y vuelves después de 1 minuto, la pide de nuevo.
 * Mientras está bloqueada, se ve una pantalla con el logo y un botón para desbloquear.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

const RE_BLOQUEO_MS = 60_000; // 1 minuto fuera de la app

type LockContextValue = {
  activado: boolean;
  /** Activa/desactiva el bloqueo (pide la huella para confirmar). Devuelve si se logró. */
  cambiarBloqueo: (activar: boolean) => Promise<boolean>;
  disponible: boolean;
};

const LockContext = createContext<LockContextValue | null>(null);

export async function autenticar(mensaje = 'Desbloquea Tinzit0'): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: mensaje,
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false, // permite usar el PIN/patrón si la huella falla
  });
  return r.success;
}

export function LockGate({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [activado, setActivado] = useState(false);
  const [disponible, setDisponible] = useState(false);
  const [bloqueada, setBloqueada] = useState(false);
  const [listo, setListo] = useState(false);
  const salidaRef = useRef<number | null>(null);
  const autenticandoRef = useRef(false);

  const desbloquear = useCallback(async () => {
    if (autenticandoRef.current) return;
    autenticandoRef.current = true;
    try {
      if (await autenticar()) setBloqueada(false);
    } finally {
      autenticandoRef.current = false;
    }
  }, []);

  // Al iniciar: ¿está activado y el celular tiene huella/PIN configurado?
  useEffect(() => {
    (async () => {
      const hw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const nivel = await LocalAuthentication.getEnrolledLevelAsync().catch(() => 0);
      const ok = hw || nivel > 0;
      setDisponible(ok);
      const on = (await getSetting(db, 'bloqueo')) === '1' && ok;
      setActivado(on);
      setBloqueada(on);
      setListo(true);
      if (on) desbloquear();
    })().catch(() => setListo(true));
  }, [db, desbloquear]);

  // Volver a bloquear si estuviste fuera más de 1 minuto.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (!activado) return;
      if (estado === 'background') salidaRef.current = Date.now();
      if (estado === 'active' && salidaRef.current && Date.now() - salidaRef.current > RE_BLOQUEO_MS) {
        salidaRef.current = null;
        setBloqueada(true);
        desbloquear();
      }
    });
    return () => sub.remove();
  }, [activado, desbloquear]);

  const cambiarBloqueo = async (activar: boolean) => {
    const ok = await autenticar(activar ? 'Confirma para activar el bloqueo' : 'Confirma para desactivar el bloqueo');
    if (!ok) return false;
    await setSetting(db, 'bloqueo', activar ? '1' : '0');
    setActivado(activar);
    return true;
  };

  if (!listo) return null;

  return (
    <LockContext.Provider value={{ activado, cambiarBloqueo, disponible }}>
      {children}
      {bloqueada ? (
        <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: colors.bg }]}>
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="finger-print" size={40} color={colors.accent} />
          </View>
          <AppText variant="title">Tinzit0 está bloqueada</AppText>
          <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            Usa tu huella o el PIN del celular para entrar.
          </AppText>
          <Button label="Desbloquear" onPress={desbloquear} style={{ alignSelf: 'stretch', marginTop: space.xl }} />
        </View>
      ) : null}
    </LockContext.Provider>
  );
}

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error('useLock debe usarse dentro de <LockGate>');
  return ctx;
}

const styles = StyleSheet.create({
  lock: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  icon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
});
