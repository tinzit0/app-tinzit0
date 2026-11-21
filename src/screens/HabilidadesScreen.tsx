/**
 * Guía de habilidades DBT en palabras simples. Con "La usé hoy" queda anotada en tu tarjeta del día.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { HABILIDADES } from '@/bienestar/logica';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { guardarTarjeta, obtenerTarjeta } from '@/database/bienestar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { toISODate } from '@/utils/fechas';

const GRUPOS = [...new Set(HABILIDADES.map((h) => h.grupo))];

export function HabilidadesScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [usadas, setUsadas] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      obtenerTarjeta(db).then((t) => setUsadas(t?.habilidades ?? [])).catch(() => {});
    }, [db]),
  );

  const alternar = async (clave: string) => {
    const t = (await obtenerTarjeta(db)) ?? { date: toISODate(), animo: null, emociones: {}, impulso: null, actue: false, habilidades: [], sueno: null, nota: null };
    const habilidades = t.habilidades.includes(clave) ? t.habilidades.filter((x) => x !== clave) : [...t.habilidades, clave];
    if (!t.habilidades.includes(clave)) Haptics.selectionAsync().catch(() => {});
    await guardarTarjeta(db, { ...t, habilidades });
    setUsadas(habilidades);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Habilidades' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <AppText variant="body" tone="secondary">
          Son las herramientas de la terapia DBT. No hay que saberlas todas: elige una o dos y practícalas.
        </AppText>
        {GRUPOS.map((g) => (
          <View key={g} style={{ marginTop: space.xxl }}>
            <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>{g}</AppText>
            <View style={{ gap: space.sm }}>
              {HABILIDADES.filter((h) => h.grupo === g).map((h) => {
                const usada = usadas.includes(h.clave);
                return (
                  <Card key={h.clave} style={styles.fila}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="headline">{h.nombre}</AppText>
                      <AppText variant="callout" tone="secondary" style={{ marginTop: 2 }}>{h.que}</AppText>
                    </View>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityState={{ selected: usada }}
                      accessibilityLabel={usada ? `${h.nombre}: anotada hoy` : `Anotar que usé ${h.nombre} hoy`}
                      onPress={() => alternar(h.clave)}
                      hitSlop={6}
                      style={[styles.check, { backgroundColor: usada ? colors.accent : colors.surfaceRaised }]}
                    >
                      <Ionicons name={usada ? 'checkmark' : 'add'} size={20} color={usada ? colors.onAccent : colors.textSecondary} />
                    </PressableScale>
                  </Card>
                );
              })}
            </View>
          </View>
        ))}
        <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xl, textAlign: 'center' }}>
          Toca + cuando uses una: queda anotada en tu tarjeta de hoy.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  check: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
