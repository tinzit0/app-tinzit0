/**
 * Tarjeta del clima en Hoy: temperatura actual, estado, máx/mín y lluvia.
 * Tocarla abre el pronóstico completo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { consejoClima, infoClima, type Pronostico } from '@/clima/clima';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Card } from './Card';

export function ClimaCard({ p }: { p: Pronostico | null }) {
  const router = useRouter();
  const { colors } = useTheme();

  if (!p) {
    return (
      <Card onPress={() => router.push('/clima')} accessibilityLabel="Clima" style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={22} color={colors.textTertiary} />
        <AppText variant="callout" tone="secondary" style={{ flex: 1 }}>
          Sin datos del clima por ahora. Revisa tu conexión.
        </AppText>
      </Card>
    );
  }

  const hoy = p.dias[0];
  const info = infoClima(p.actual.codigo, p.actual.esDia);
  const consejo = hoy ? consejoClima(hoy) : '';

  return (
    <Card
      onPress={() => router.push('/clima')}
      accessibilityLabel={`Clima en ${p.ubicacion.nombre}: ${p.actual.temp} grados, ${info.texto}`}
      style={styles.row}
    >
      <Ionicons name={info.icono as keyof typeof Ionicons.glyphMap} size={34} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <View style={styles.tempRow}>
          <AppText variant="title" tabular>{p.actual.temp}°</AppText>
          <AppText variant="callout" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {info.texto}
          </AppText>
        </View>
        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
          {p.ubicacion.nombre.split(',')[0]} · {hoy ? `${hoy.max}° / ${hoy.min}°` : ''}
          {hoy && hoy.lluvia >= 20 ? ` · 💧 ${hoy.lluvia}%` : ''}
        </AppText>
        {consejo ? (
          <AppText variant="caption" tone="accent" numberOfLines={1} style={{ marginTop: 2 }}>
            {consejo}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  tempRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
});
