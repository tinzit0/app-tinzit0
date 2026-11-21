/**
 * Configuración inicial (breve y opcional): tu nombre, presupuesto semanal y qué partes de la
 * app usas (así Inicio muestra solo eso). Todo se puede cambiar después en Ajustes.
 * Aparece una sola vez, solo si la app está vacía. "Saltar" la cierra igual.
 */
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { MontoInput } from '@/components/MontoInput';
import { setSetting } from '@/database/queries';
import { porDefecto, type IdModulo } from '@/inicio/modulos';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Partes opcionales de la app (lo demás se muestra siempre). */
const PARTES: { id: IdModulo; label: string }[] = [
  { id: 'estudio', label: 'Estudio (U)' },
  { id: 'gymGastos', label: 'Gym y gastos' },
  { id: 'habitos', label: 'Hábitos' },
  { id: 'bienestar', label: 'Bienestar' },
  { id: 'musica', label: 'Música' },
  { id: 'clima', label: 'Clima' },
];

export function BienvenidaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [nombre, setNombre] = useState('');
  const [presupuesto, setPresupuesto] = useState(0);
  const [usa, setUsa] = useState<IdModulo[]>(PARTES.map((p) => p.id));
  const [guardando, setGuardando] = useState(false);

  const salir = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const terminar = async (guardarTodo: boolean) => {
    setGuardando(true);
    try {
      if (guardarTodo) {
        if (nombre.trim()) await setSetting(db, 'nombre', nombre.trim());
        if (presupuesto > 0) await setSetting(db, 'presupuesto_semanal', String(Math.round(presupuesto)));
        const opcionales = new Set(PARTES.map((p) => p.id));
        const modulos = porDefecto().map((m) => ({ ...m, visible: !opcionales.has(m.id) || usa.includes(m.id) }));
        await setSetting(db, 'inicio_modulos', JSON.stringify(modulos));
      }
      await setSetting(db, 'bienvenida', '1');
    } finally {
      setGuardando(false);
      salir();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        <AppText variant="display">Hola 👋</AppText>
        <AppText variant="body" tone="secondary" style={{ marginTop: space.sm }}>
          Tres preguntas rápidas para dejar Tinzit0 a tu medida. Todo es opcional y queda solo en tu celular.
        </AppText>

        <View style={styles.seccion}>
          <Field label="¿Cómo te llamo?" value={nombre} onChangeText={setNombre} placeholder="Tu nombre" maxLength={30} autoCapitalize="words" />
        </View>

        <View style={styles.seccion}>
          <FieldLabel>Presupuesto de la semana (opcional)</FieldLabel>
          <MontoInput value={presupuesto} onChange={setPresupuesto} size={32} accessibilityLabel="Presupuesto semanal" />
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs }}>Con esto te digo cuánto puedes gastar cada día.</AppText>
        </View>

        <View style={styles.seccion}>
          <FieldLabel>¿Qué quieres ver en Inicio?</FieldLabel>
          <View style={styles.wrap}>
            {PARTES.map((p) => {
              const sel = usa.includes(p.id);
              return <Chip key={p.id} label={p.label} selected={sel} onPress={() => setUsa((xs) => (sel ? xs.filter((x) => x !== p.id) : [...xs, p.id]))} />;
            })}
          </View>
        </View>

        <Button label="Listo" onPress={() => terminar(true)} loading={guardando} style={{ marginTop: space.xxl }} />
        <Button label="Saltar" variant="secondary" onPress={() => terminar(false)} disabled={guardando} style={{ marginTop: space.sm }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl },
  seccion: { marginTop: space.xxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
