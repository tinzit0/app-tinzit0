/**
 * Vista cuando Bienestar está protegido con huella y todavía no lo abres.
 * Igual deja a mano "Estoy a mil" y el plan de crisis (nunca se bloquean).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function Cerrado({ onAbrir, revisando }: { onAbrir: () => void; revisando?: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      {revisando ? null : (
        <>
          <Ionicons name="lock-closed-outline" size={36} color={colors.textSecondary} />
          <AppText variant="title" style={{ textAlign: 'center' }}>Tu espacio está protegido</AppText>
          <AppText variant="callout" tone="secondary" style={{ textAlign: 'center' }}>
            Usa tu huella para ver tu registro.
          </AppText>
          <Button label="Desbloquear" onPress={onAbrir} style={{ alignSelf: 'stretch', marginTop: space.md }} />
          <Button label="Estoy a mil" variant="secondary" onPress={() => router.push('/calma')} style={{ alignSelf: 'stretch' }} />
          <Button label="Plan de crisis" variant="secondary" onPress={() => router.push('/plan-crisis')} style={{ alignSelf: 'stretch' }} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
});
