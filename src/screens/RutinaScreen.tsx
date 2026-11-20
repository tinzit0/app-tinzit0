/**
 * Editar la rutina semanal: qué toca cada día (o descanso).
 * Se guarda al tiro cada vez que eliges una opción.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { GRUPOS, guardarDiaRutina, obtenerRutina } from '@/database/gym';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function RutinaScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [rutina, setRutina] = useState<Record<number, string>>({});
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    obtenerRutina(db).then((r) => setRutina(Object.fromEntries(r.map((x) => [x.weekday, x.label]))));
  }, [db]);

  const fijar = (dia: number, label: string | null) => {
    setRutina((r) => {
      const n = { ...r };
      if (label) n[dia] = label;
      else delete n[dia];
      return n;
    });
    guardarDiaRutina(db, dia, label).catch(console.warn);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Rutina semanal' }} />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="callout" tone="secondary" style={{ marginBottom: space.xl }}>
          Toca un día para elegir qué entrenas. Lo que no tenga nada queda como descanso.
        </AppText>
        {DIAS.map((nombre, i) => {
          const dia = i + 1;
          const label = rutina[dia];
          const open = abierto === dia;
          return (
            <View
              key={dia}
              style={[styles.day, { backgroundColor: colors.surface, borderColor: open ? colors.text : colors.border }]}
            >
              <Pressable
                onPress={() => setAbierto(open ? null : dia)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${nombre}: ${label ?? 'descanso'}. Tocar para cambiar`}
                style={styles.dayRow}
              >
                <AppText variant="headline" style={{ flex: 1 }}>{nombre}</AppText>
                <AppText variant="callout" tone={label ? 'accent' : 'tertiary'}>{label ?? 'Descanso'}</AppText>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
              </Pressable>
              {open ? (
                <View style={{ paddingBottom: space.md, gap: space.md }}>
                  <View style={styles.chips}>
                    <Chip label="Descanso" compact selected={!label} onPress={() => fijar(dia, null)} />
                    {GRUPOS.map((g) => (
                      <Chip key={g} label={g} compact selected={label === g} onPress={() => fijar(dia, g)} />
                    ))}
                  </View>
                  <Field
                    placeholder="O escribe otra cosa (ej: Pecho y tríceps)"
                    defaultValue={label && !GRUPOS.includes(label) ? label : ''}
                    onEndEditing={(e) => e.nativeEvent.text.trim() && fijar(dia, e.nativeEvent.text)}
                    returnKeyType="done"
                    maxLength={30}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  day: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: space.lg, paddingVertical: space.xs, marginBottom: space.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
