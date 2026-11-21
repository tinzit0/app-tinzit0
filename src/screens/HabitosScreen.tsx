/**
 * Hábitos: mapa de calor general + cada hábito con su racha.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { Heatmap } from '@/components/Heatmap';
import { alternarHabito, listarHabitos, registrosDesde, type HabitoConEstado } from '@/database/habitos';
import { useLogros } from '@/components/LogrosProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

const SEMANAS = 16;

export function HabitosScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { revisar } = useLogros();
  const [habitos, setHabitos] = useState<HabitoConEstado[]>([]);
  const [mapa, setMapa] = useState<Map<string, number>>(new Map());
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const desde = toISODate(new Date(Date.now() - SEMANAS * 7 * 86400000));
    setHabitos(await listarHabitos(db));
    setMapa(await registrosDesde(db, desde));
    setCargado(true);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const toggle = async (h: HabitoConEstado) => {
    if (!h.hechoHoy) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await alternarHabito(db, h.id, !h.hechoHoy);
      revisar(true);
    } catch (e) {
      console.warn(e);
    }
    await cargar().catch(console.warn);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Hábitos' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        {cargado && habitos.length === 0 ? (
          <EmptyState
            icon="leaf-outline"
            title="Los hábitos se construyen de a poco"
            description="Crea uno, márcalo cada día y mira cómo crece tu racha."
          />
        ) : (
          <>
            <Card>
              <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>
                Últimas {SEMANAS} semanas
              </AppText>
              <Heatmap datos={mapa} maximo={habitos.length} color={colors.accent} semanas={SEMANAS} />
            </Card>

            <View style={{ gap: space.sm, marginTop: space.xl }}>
              {habitos.map((h) => (
                <Card
                  key={h.id}
                  onPress={() => router.push({ pathname: '/habito', params: { id: String(h.id) } })}
                  accessibilityLabel={`${h.name}. Racha ${h.racha} días`}
                  style={styles.row}
                >
                  <View style={[styles.icon, { backgroundColor: `${h.color}22` }]}>
                    <Ionicons name={h.icon as keyof typeof Ionicons.glyphMap} size={20} color={h.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="callout" numberOfLines={1}>{h.name}</AppText>
                    <AppText variant="caption" tone="tertiary">
                      🔥 {h.racha} {h.racha === 1 ? 'día' : 'días'} · récord {h.mejorRacha}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => toggle(h)}
                    hitSlop={10}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: h.hechoHoy }}
                    accessibilityLabel={`Marcar ${h.name} hoy`}
                    style={[styles.check, { borderColor: h.color, backgroundColor: h.hechoHoy ? h.color : 'transparent' }]}
                  >
                    {h.hechoHoy ? <Ionicons name="checkmark" size={18} color="#0B0B0C" /> : null}
                  </Pressable>
                </Card>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <Fab accessibilityLabel="Nuevo hábito" onPress={() => router.push('/habito-form')} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  check: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
