/**
 * Bloqueo con huella (o PIN del celular).
 *
 * Si está activado en Ajustes:
 * - Al abrir la app pide la huella.
 * - Si sales de la app y vuelves después de 1 minuto, la pide de nuevo.
 * Mientras está bloqueada, se ve una pantalla con el logo y un botón para desbloquear.
 * - El contenido de atrás queda oculto también para lectores de pantalla (TalkBack).
 * - La escucha de "ey Tinzit0" se detiene (VozProvider lee `bloqueada`).
 * - "Estoy a mil" y las líneas de ayuda se abren SIN desbloquear: esas pantallas no muestran
 *   datos privados mientras la app está bloqueada (el plan de crisis personal se oculta).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as LocalAuthentication from 'expo-local-authentication';
import { usePathname, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

const RE_BLOQUEO_MS = 60_000; // 1 minuto fuera de la app

/** Pantallas de ayuda que se pueden abrir sin desbloquear (no muestran datos privados si está bloqueada). */
export const RUTAS_DE_AYUDA = ['/calma', '/plan-crisis'];

type LockContextValue = {
  activado: boolean;
  /** true mientras la app pide huella (aunque se esté viendo una pantalla de ayuda). */
  bloqueada: boolean;
  /** Activa/desactiva el bloqueo (pide la huella para confirmar). Devuelve si se logró. */
  cambiarBloqueo: (activar: boolean) => Promise<boolean>;
  disponible: boolean;
};

const LockContext = createContext<LockContextValue | null>(null);

/** Pide huella/PIN. Cualquier error cuenta como "no autorizado" (nunca abre por fallar). */
export async function autenticar(mensaje = 'Desbloquea Tinzit0'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: mensaje,
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false, // permite usar el PIN/patrón si la huella falla
    });
    return r.success;
  } catch {
    return false;
  }
}

export function LockGate({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const router = useRouter();
  const ruta = usePathname();
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
      if (estado === 'background') salidaRef.current ??= Date.now();
      if (estado === 'active') {
        const fuera = salidaRef.current;
        salidaRef.current = null;
        if (fuera && Date.now() - fuera > RE_BLOQUEO_MS) {
          setBloqueada(true);
          desbloquear();
        }
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

  // Bloqueada pero viendo una pantalla de ayuda: se muestra esa pantalla (sin datos privados).
  const enAyuda = bloqueada && RUTAS_DE_AYUDA.includes(ruta);
  const tapar = bloqueada && !enAyuda;

  return (
    <LockContext.Provider value={{ activado, bloqueada, cambiarBloqueo, disponible }}>
      <View
        style={{ flex: 1 }}
        // Lo que está detrás del bloqueo no existe para TalkBack.
        importantForAccessibility={tapar ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={tapar}
      >
        {children}
      </View>
      {enAyuda ? (
        <View style={[styles.barraAyuda, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>Tinzit0 sigue bloqueada</AppText>
          <Button label="Volver" variant="secondary" onPress={() => router.replace('/')} style={{ minHeight: 40 }} />
        </View>
      ) : null}
      {tapar ? (
        <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="finger-print" size={40} color={colors.accent} />
          </View>
          <AppText variant="title">Tinzit0 está bloqueada</AppText>
          <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            Usa tu huella o el PIN del celular para entrar.
          </AppText>
          <Button label="Desbloquear" onPress={desbloquear} style={{ alignSelf: 'stretch', marginTop: space.xl }} />
          {/* Ayuda inmediata sin desbloquear (no muestra nada privado). */}
          <View style={styles.ayuda}>
            <Button label="Estoy a mil" variant="secondary" onPress={() => router.push('/calma')} style={{ flex: 1 }} />
            <Button label="Líneas de ayuda" variant="secondary" onPress={() => router.push('/plan-crisis')} style={{ flex: 1 }} />
          </View>
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
  ayuda: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  barraAyuda: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 14,
    borderWidth: 1,
  },
});
