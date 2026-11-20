/**
 * Apartado "Tus apps" en la pantalla Hoy: una grilla de 4 columnas
 * con tus apps favoritas. Tocar una la abre.
 */
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { abrirApp, type AppFavorita } from '@/database/apps';
import { space } from '@/theme/tokens';
import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export function QuickApps({ apps }: { apps: AppFavorita[] }) {
  const router = useRouter();
  return (
    <View>
      <View style={styles.header}>
        <AppText variant="headline">Tus apps</AppText>
        <Pressable onPress={() => router.push('/apps')} hitSlop={10} accessibilityRole="button">
          <AppText variant="callout" tone="accent">Editar</AppText>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {apps.map((a) => (
          <PressableScale
            key={a.id}
            pressedScale={0.92}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              abrirApp(a.pkg);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${a.label}`}
            style={styles.item}
          >
            <AppIcon app={a} size={52} />
            <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.label}>
              {a.label}
            </AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: space.md,
    marginHorizontal: space.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
  item: { width: '25%', alignItems: 'center', gap: space.sm },
  label: { maxWidth: '90%' },
});
