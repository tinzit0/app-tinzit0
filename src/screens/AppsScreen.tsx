/**
 * Elegir tus apps favoritas (hasta 8). Toca para agregar o quitar.
 * Se guardan en el orden en que las vas eligiendo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { PressableScale } from '@/components/PressableScale';
import { guardarApps, listarApps } from '@/database/apps';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { CATALOGO_APPS, MAX_APPS } from '@/utils/apps';

export function AppsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [elegidas, setElegidas] = useState<string[]>([]);

  useEffect(() => {
    listarApps(db).then((a) => setElegidas(a.map((x) => x.pkg)));
  }, [db]);

  const alternar = (pkg: string) => {
    let nuevas: string[];
    if (elegidas.includes(pkg)) nuevas = elegidas.filter((p) => p !== pkg);
    else if (elegidas.length >= MAX_APPS) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    } else nuevas = [...elegidas, pkg];
    Haptics.selectionAsync().catch(() => {});
    setElegidas(nuevas);
    guardarApps(db, nuevas.map((p) => CATALOGO_APPS.find((a) => a.pkg === p)!)).catch(console.warn);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Tus apps' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <AppText variant="callout" tone="secondary" style={{ marginBottom: space.xl }}>
          Elige hasta {MAX_APPS}. Van a aparecer en Hoy para abrirlas de un toque.{' '}
          <AppText variant="callout" tone="tertiary">({elegidas.length}/{MAX_APPS})</AppText>
        </AppText>
        <View style={styles.grid}>
          {CATALOGO_APPS.map((a) => {
            const pos = elegidas.indexOf(a.pkg);
            const sel = pos >= 0;
            return (
              <PressableScale
                key={a.pkg}
                pressedScale={0.94}
                onPress={() => alternar(a.pkg)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sel }}
                accessibilityLabel={a.label}
                style={[styles.item, { opacity: !sel && elegidas.length >= MAX_APPS ? 0.4 : 1 }]}
              >
                <View>
                  <AppIcon app={a} size={52} />
                  {sel ? (
                    <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
                      <AppText variant="caption" style={{ color: colors.onAccent, fontSize: 11 }}>{pos + 1}</AppText>
                    </View>
                  ) : (
                    <View style={[styles.badge, { backgroundColor: colors.surfaceRaised, borderColor: colors.bg }]}>
                      <Ionicons name="add" size={12} color={colors.textSecondary} />
                    </View>
                  )}
                </View>
                <AppText variant="caption" tone={sel ? 'primary' : 'secondary'} numberOfLines={1}>{a.label}</AppText>
              </PressableScale>
            );
          })}
        </View>
        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xxl, textAlign: 'center' }}>
          ¿Falta alguna (como la app de tu banco)? Pídemela y la agrego al catálogo.
        </AppText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xl },
  item: { width: '25%', alignItems: 'center', gap: space.sm },
  badge: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
