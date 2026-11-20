/**
 * Ajustes (Fase 1): tu nombre para el saludo y el tema claro/oscuro.
 * En la Fase 6 se suman horas de notificaciones, presupuesto y más.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getSetting, setSetting } from '@/database/queries';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';

export function AjustesScreen() {
  const db = useSQLiteContext();
  const { colors, preference, setPreference } = useTheme();
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    getSetting(db, 'nombre').then((v) => setNombre(v ?? ''));
  }, [db]);

  // Guarda el nombre cuando terminas de escribir (al salir del campo).
  const guardarNombre = () => {
    setSetting(db, 'nombre', nombre.trim()).catch(console.warn);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <AppText variant="overline" tone="tertiary" style={styles.label}>Perfil</AppText>
      <Card>
        <AppText variant="callout" tone="secondary" style={{ marginBottom: space.sm }}>
          ¿Cómo te saludo?
        </AppText>
        <TextInput
          value={nombre}
          onChangeText={setNombre}
          onBlur={guardarNombre}
          onSubmitEditing={guardarNombre}
          placeholder="Tu nombre"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          autoCapitalize="words"
          maxLength={24}
          accessibilityLabel="Tu nombre"
          style={[
            type.body,
            styles.input,
            { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        />
      </Card>

      <AppText variant="overline" tone="tertiary" style={[styles.label, { marginTop: space.xxl }]}>
        Apariencia
      </AppText>
      <Card>
        <SegmentedControl<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      </Card>

      <View style={styles.footer}>
        <AppText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
          Tinzit0 · Tus datos viven solo en este celular
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  label: { marginBottom: space.sm, marginLeft: space.xs },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
  },
  footer: { marginTop: space.xxxl },
});
