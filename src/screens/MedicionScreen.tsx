/**
 * Registrar peso y medidas de un día. Todo es opcional: llena lo que midas.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { guardarMedicion, medicionDeFecha, MEDIDAS, ultimosValores, type Medida } from '@/database/cuerpo';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { fechaLarga, fromISODate, toISODate } from '@/utils/fechas';

export function MedicionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ fecha?: string }>();
  const fecha = params.fecha ?? toISODate();

  const [valores, setValores] = useState<Partial<Record<Medida, string>>>({});
  const [ultimos, setUltimos] = useState<Partial<Record<Medida, { valor: number }>>>({});

  useEffect(() => {
    medicionDeFecha(db, fecha).then((m) => {
      if (!m) return;
      const v: Partial<Record<Medida, string>> = {};
      for (const x of MEDIDAS) if (m[x.key] != null) v[x.key] = String(m[x.key]);
      setValores(v);
    });
    ultimosValores(db).then(setUltimos);
  }, [db, fecha]);

  const num = (s?: string) => {
    const n = Number((s ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const algo = MEDIDAS.some((m) => num(valores[m.key]) != null);

  const guardar = async () => {
    await guardarMedicion(
      db,
      fecha,
      Object.fromEntries(MEDIDAS.map((m) => [m.key, num(valores[m.key])])) as Record<Medida, number | null>,
    );
    if (router.canGoBack()) router.back();
    else router.replace('/cuerpo');
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Medición' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="callout" tone="secondary" style={{ marginBottom: space.xl }}>
          {fechaLarga(fromISODate(fecha))}. Llena solo lo que hayas medido.
        </AppText>
        <View style={{ gap: space.sm }}>
          {MEDIDAS.map((m, i) => (
            <View key={m.key} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <AppText variant="headline">{m.label}</AppText>
                {ultimos[m.key] ? (
                  <AppText variant="caption" tone="tertiary">Último: {ultimos[m.key]!.valor} {m.unidad}</AppText>
                ) : null}
              </View>
              <TextInput
                value={valores[m.key] ?? ''}
                onChangeText={(t) => setValores((v) => ({ ...v, [m.key]: t.replace(/[^\d.,]/g, '') }))}
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                autoFocus={i === 0 && !params.fecha}
                selectionColor={colors.accent}
                accessibilityLabel={`${m.label} en ${m.unidad}`}
                maxLength={6}
                style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised }]}
              />
              <AppText variant="callout" tone="tertiary" style={{ width: 26 }}>{m.unidad}</AppText>
            </View>
          ))}
        </View>
        <Button label="Guardar" onPress={guardar} disabled={!algo} style={{ marginTop: space.xxl }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, borderWidth: 1, padding: space.md, paddingLeft: space.lg },
  input: {
    fontFamily: fonts.semibold,
    fontSize: 20,
    textAlign: 'right',
    width: 92,
    minHeight: 44,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontVariant: ['tabular-nums'],
  },
});
