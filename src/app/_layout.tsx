/**
 * Layout raíz: lo que envuelve a TODA la app.
 * 1. Carga la tipografía Inter.
 * 2. Abre la base de datos y aplica las migraciones.
 * 3. Activa el tema claro/oscuro.
 * 4. Activa el bloqueo con huella (si lo encendiste en Ajustes) y los logros.
 * 5. Define la navegación: las pestañas + la pantalla de Ajustes encima.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppLifecycle } from '@/components/AppLifecycle';
import { LockGate } from '@/components/LockGate';
import { LogrosProvider, useLogros } from '@/components/LogrosProvider';
import { migrateDb } from '@/database/schema';
import { VozProvider } from '@/voice/VozProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

// La pantalla de carga se queda hasta que la app esté lista, y se va con un fundido suave.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Mientras carga la fuente se mantiene la pantalla de carga (splash).
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SQLiteProvider databaseName="tinzit0.db" onInit={migrateDb}>
          <LockGate>
            <LogrosProvider>
              <VozProvider>
                <RootStack />
              </VozProvider>
            </LogrosProvider>
          </LockGate>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { colors, isDark } = useTheme();
  const { revisar } = useLogros();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppLifecycle />
      <Stack
        // Cada vez que cambias de pantalla revisamos si ganaste alguna medalla.
        screenListeners={{ focus: () => revisar() }}
        screenOptions={{
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
        <Stack.Screen name="tarea" options={{ presentation: 'modal', title: 'Tarea' }} />
        <Stack.Screen name="gasto" options={{ presentation: 'modal', title: 'Gasto' }} />
        <Stack.Screen name="entreno" options={{ title: 'Entrenamiento' }} />
        <Stack.Screen name="ejercicio" options={{ title: 'Ejercicio' }} />
        <Stack.Screen name="rutina" options={{ title: 'Rutina' }} />
        <Stack.Screen name="nota" options={{ title: '' }} />
        <Stack.Screen name="apps" options={{ title: 'Tus apps' }} />
        <Stack.Screen name="fijos" options={{ title: 'Gastos fijos' }} />
        <Stack.Screen name="fijo" options={{ presentation: 'modal', title: 'Gasto fijo' }} />
        <Stack.Screen name="metas" options={{ title: 'Metas de ahorro' }} />
        <Stack.Screen name="meta" options={{ title: 'Meta' }} />
        <Stack.Screen name="meta-form" options={{ presentation: 'modal', title: 'Meta' }} />
        <Stack.Screen name="cuerpo" options={{ title: 'Cuerpo' }} />
        <Stack.Screen name="medicion" options={{ presentation: 'modal', title: 'Medición' }} />
        <Stack.Screen name="habitos" options={{ title: 'Hábitos' }} />
        <Stack.Screen name="habito" options={{ title: 'Hábito' }} />
        <Stack.Screen name="habito-form" options={{ presentation: 'modal', title: 'Hábito' }} />
        <Stack.Screen name="logros" options={{ title: 'Medallas' }} />
        <Stack.Screen name="estadisticas" options={{ title: 'Estadísticas' }} />
        <Stack.Screen name="asistente" options={{ title: 'Tinzit0' }} />
        <Stack.Screen name="clima" options={{ title: 'Clima' }} />
        <Stack.Screen name="musica" options={{ title: 'Música' }} />
        <Stack.Screen name="estudio" options={{ title: 'Estudio' }} />
        <Stack.Screen name="ramo" options={{ title: 'Ramo' }} />
        <Stack.Screen name="ramo-form" options={{ presentation: 'modal', title: 'Ramo' }} />
        <Stack.Screen name="evaluacion" options={{ presentation: 'modal', title: 'Evaluación' }} />
        <Stack.Screen name="horario" options={{ title: 'Horario' }} />
        <Stack.Screen name="pomodoro" options={{ title: 'Modo enfoque' }} />
        <Stack.Screen name="tarjetas" options={{ title: 'Tarjetas' }} />
        <Stack.Screen name="repaso" options={{ title: 'Repaso' }} />
        <Stack.Screen name="grabar" options={{ title: 'Grabar clase' }} />
        <Stack.Screen name="escanear" options={{ title: 'Escanear apuntes' }} />
      </Stack>
    </>
  );
}
