/**
 * Hábitos en la pantalla Hoy: una fila de círculos para marcarlos de un toque.
 * El círculo se rellena con el color del hábito y vibra al completarlo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { HabitoConEstado } from '@/database/habitos';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

type Props = { habitos: HabitoConEstado[]; onToggle: (h: HabitoConEstado) => void };

export function HabitosHoy({ habitos, onToggle }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  // Solo los que tocan hoy (o que igual marcaste).
  const deHoy = habitos.filter((h) => h.tocaHoy || h.hechoHoy);
  const hechos = deHoy.filter((h) => h.hechoHoy).length;

  return (
    <View>
      <View style={styles.header}>
        <AppText variant="headline">
          Hábitos <AppText variant="callout" tone="tertiary">{hechos}/{deHoy.length}</AppText>
        </AppText>
        <Pressable onPress={() => router.push('/habitos')} hitSlop={10} accessibilityRole="button">
          <AppText variant="callout" tone="accent">{habitos.length ? 'Ver todo' : 'Crear'}</AppText>
        </Pressable>
      </View>
      {habitos.length === 0 ? (
        <PressableScale
          onPress={() => router.push('/habito-form')}
          accessibilityRole="button"
          style={[styles.vacio, { borderColor: colors.border }]}
        >
          <Ionicons name="add" size={18} color={colors.textSecondary} />
          <AppText variant="callout" tone="secondary">Crea tu primer hábito (agua, leer, dormir bien…)</AppText>
        </PressableScale>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {deHoy.map((h) => (
            <PressableScale
              key={h.id}
              pressedScale={0.92}
              onPress={() => {
                if (!h.hechoHoy) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                else Haptics.selectionAsync().catch(() => {});
                onToggle(h);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: h.hechoHoy }}
              accessibilityLabel={`${h.name}, racha de ${h.racha} días`}
              style={styles.item}
            >
              <View
                style={[
                  styles.circle,
                  { borderColor: h.color, backgroundColor: h.hechoHoy ? h.color : 'transparent' },
                ]}
              >
                <Ionicons
                  name={(h.hechoHoy ? 'checkmark' : h.icon) as keyof typeof Ionicons.glyphMap}
                  size={24}
                  color={h.hechoHoy ? '#0B0B0C' : h.color}
                />
              </View>
              <AppText variant="caption" tone={h.hechoHoy ? 'primary' : 'secondary'} numberOfLines={1} style={styles.label}>
                {h.name}
              </AppText>
              {h.racha > 1 ? (
                <AppText variant="caption" tone="tertiary" style={{ fontSize: 11 }}>🔥 {h.racha}</AppText>
              ) : null}
            </PressableScale>
          ))}
        </ScrollView>
      )}
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
  row: { gap: space.md, paddingHorizontal: space.xs },
  item: { width: 72, alignItems: 'center', gap: space.xs },
  circle: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  label: { maxWidth: 72, textAlign: 'center' },
  vacio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: space.lg,
  },
});
