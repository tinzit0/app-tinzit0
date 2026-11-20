/**
 * Botón flotante "+" (abajo a la derecha) para crear algo nuevo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { PressableScale } from './PressableScale';

type Props = { onPress: () => void; accessibilityLabel: string; icon?: keyof typeof Ionicons.glyphMap };

export function Fab({ onPress, accessibilityLabel, icon = 'add' }: Props) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressedScale={0.94}
      style={[styles.fab, { backgroundColor: colors.accent, shadowColor: '#000' }]}
    >
      <Ionicons name={icon} size={28} color={colors.onAccent} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: space.xl,
    bottom: space.xl,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
});
