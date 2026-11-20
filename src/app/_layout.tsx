/**
 * Layout raíz: lo que envuelve a TODA la app.
 * 1. Carga la tipografía Inter.
 * 2. Abre la base de datos y aplica las migraciones.
 * 3. Activa el tema claro/oscuro.
 * 4. Activa el bloqueo con huella (si lo encendiste en Ajustes).
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
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppLifecycle } from '@/components/AppLifecycle';
import { LockGate } from '@/components/LockGate';
import { migrateDb } from '@/database/schema';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  // Mientras carga la fuente se mantiene la pantalla de inicio (splash).
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SQLiteProvider databaseName="tinzit0.db" onInit={migrateDb}>
          <LockGate>
            <RootStack />
          </LockGate>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppLifecycle />
      <Stack
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
      </Stack>
    </>
  );
}
