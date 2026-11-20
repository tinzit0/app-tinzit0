/**
 * Detalle de un hábito: racha, récord, total y su propio mapa de calor.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Heatmap } from '@/components/Heatmap';
import { listarHabitos, registrosDesde, type HabitoConEstado } from '@/database/habitos';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

const SEMANAS = 26;

export function HabitoScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [h, setH] = useState<HabitoConEstado | null>(null);
  const [mapa, setMapa] = useState<Map<string, number>>(new Map());

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setH((await listarHabitos(db)).find((x) => x.id === Number(id)) ?? null);
        setMapa(await registrosDesde(db, toISODate(new Date(Date.now() - SEMANAS * 7 * 86400000)), Number(id)));
      })().catch(console.warn);
    }, [db, id]),
  );

  if (!h) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <>
      <Stack.Screen
        options={{
          title: h.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/habito-form', params: { id: String(h.id) } })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Editar hábito"
            >
              <Ionicons name="create-outline" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <View style={styles.stats}>
          {[
            { label: 'Racha', value: `🔥 ${h.racha}` },
            { label: 'Récord', value: String(h.mejorRacha) },
            { label: 'Total', value: String(h.total) },
          ].map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppText variant="overline" tone="tertiary">{s.label}</AppText>
              <AppText variant="title" tabular>{s.value}</AppText>
            </View>
          ))}
        </View>
        <Card style={{ marginTop: space.md }}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Últimos 6 meses</AppText>
          <Heatmap datos={mapa} maximo={1} color={h.color} semanas={SEMANAS} />
        </Card>
        <AppText variant="callout" tone="secondary" style={{ marginTop: space.xl, textAlign: 'center' }}>
          {h.racha === 0
            ? 'Hoy es un buen día para partir de nuevo.'
            : h.racha >= h.mejorRacha
              ? 'Estás en tu mejor racha. No la sueltes 💪'
              : `Te faltan ${h.mejorRacha - h.racha} días para igualar tu récord.`}
        </AppText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: space.md, gap: space.xs },
});
