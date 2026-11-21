/**
 * Buscador de funciones: escribe "plata", "boleta" o "respirar" y te lleva a la pantalla.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { PressableScale } from '@/components/PressableScale';
import { buscarFunciones } from '@/inicio/funciones';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';

export function BuscarScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const resultados = useMemo(() => buscarFunciones(q), [q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Buscar' }} />
      <View style={[styles.caja, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="¿Qué quieres hacer?"
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          returnKeyType="search"
          accessibilityLabel="Buscar una función de la app"
          style={[type.body, styles.input, { color: colors.text }]}
          onSubmitEditing={() => resultados[0] && router.replace(resultados[0].ruta as never)}
        />
      </View>
      <FlatList
        data={resultados}
        keyExtractor={(f) => f.ruta}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl }}
        ListEmptyComponent={
          <AppText variant="callout" tone="secondary" style={{ marginTop: space.xl, textAlign: 'center' }}>
            No encontré esa función. Prueba con otra palabra o pregúntale al asistente.
          </AppText>
        }
        renderItem={({ item }) => (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${item.titulo}: ${item.detalle}`}
            onPress={() => router.replace(item.ruta as never)}
            style={[styles.fila, { borderBottomColor: colors.border }]}
          >
            <Ionicons name={item.icono as keyof typeof Ionicons.glyphMap} size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="callout">{item.titulo}</AppText>
              <AppText variant="caption" tone="tertiary" numberOfLines={1}>{item.detalle}</AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </PressableScale>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { flexDirection: 'row', alignItems: 'center', gap: space.sm, margin: space.xl, paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, minHeight: 50 },
  input: { flex: 1, paddingVertical: space.md },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
});
