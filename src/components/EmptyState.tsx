/**
 * Estado vacío: lo que se ve cuando aún no hay datos.
 * Un buen estado vacío explica qué va a aparecer ahí, no solo "no hay nada".
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
};

export function EmptyState({ icon, title, description }: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: space.xxxl,
        paddingHorizontal: space.xl,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentSoft,
          marginBottom: space.lg,
        }}
      >
        <Ionicons name={icon} size={24} color={colors.accent} />
      </View>
      <AppText variant="headline" style={{ textAlign: 'center', marginBottom: space.xs }}>
        {title}
      </AppText>
      <AppText variant="callout" tone="secondary" style={{ textAlign: 'center', maxWidth: 280 }}>
        {description}
      </AppText>
    </View>
  );
}
