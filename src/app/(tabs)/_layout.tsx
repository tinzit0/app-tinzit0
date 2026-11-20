/**
 * Barra de pestañas de abajo: Hoy · Tareas · Gym · Gastos · Notas.
 * El ícono se "rellena" cuando la pestaña está activa.
 * Cambiar de pestaña NO se anima a propósito: lo haces muchas veces al día
 * y una animación ahí solo haría sentir la app más lenta.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { useLogros } from '@/components/LogrosProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Ícono normal y ícono "relleno" para cada pestaña.
const ICONS: Record<string, [IconName, IconName]> = {
  index: ['sunny-outline', 'sunny'],
  tareas: ['checkmark-circle-outline', 'checkmark-circle'],
  gym: ['barbell-outline', 'barbell'],
  gastos: ['wallet-outline', 'wallet'],
  notas: ['document-text-outline', 'document-text'],
};

export default function TabsLayout() {
  const { colors } = useTheme();
  const { revisar } = useLogros();

  return (
    <Tabs
      screenListeners={{ focus: revisar }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.1 },
        sceneStyle: { backgroundColor: colors.bg },
        tabBarIcon: ({ focused, color }) => {
          const [off, on] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
          return <Ionicons name={focused ? on : off} size={22} color={String(color)} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
      <Tabs.Screen name="tareas" options={{ title: 'Tareas' }} />
      <Tabs.Screen name="gym" options={{ title: 'Gym' }} />
      <Tabs.Screen name="gastos" options={{ title: 'Gastos' }} />
      <Tabs.Screen name="notas" options={{ title: 'Notas' }} />
    </Tabs>
  );
}
