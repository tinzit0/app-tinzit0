/**
 * Crear o editar un hábito: nombre, ícono y color. Con sugerencias rápidas.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { actualizarHabito, COLORES, crearHabito, eliminarHabito, ICONOS, obtenerHabito, SUGERENCIAS } from '@/database/habitos';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export function HabitoFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState('checkmark');
  const [color, setColor] = useState(COLORES[0]);

  useEffect(() => {
    if (!id) return;
    obtenerHabito(db, id).then((h) => {
      if (!h) return;
      setNombre(h.name);
      setIcono(h.icon);
      setColor(h.color);
    });
  }, [db, id]);

  const guardar = async () => {
    if (!nombre.trim()) return;
    if (id) await actualizarHabito(db, id, { name: nombre, icon: icono, color });
    else await crearHabito(db, { name: nombre, icon: icono, color });
    router.canGoBack() ? router.back() : router.replace('/habitos');
  };

  const borrar = () =>
    Alert.alert('¿Eliminar hábito?', 'Se borra también su historial y su racha.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (id) await eliminarHabito(db, id);
          router.dismissTo('/habitos');
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar hábito' : 'Nuevo hábito' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field big value={nombre} onChangeText={setNombre} placeholder="¿Qué quieres hacer cada día?" autoFocus={!id} maxLength={40} accessibilityLabel="Nombre del hábito" />

        {!id ? (
          <View style={styles.section}>
            <FieldLabel>Ideas</FieldLabel>
            <View style={styles.wrap}>
              {SUGERENCIAS.map((s) => (
                <Chip
                  key={s.name}
                  compact
                  label={s.name}
                  selected={nombre === s.name}
                  onPress={() => {
                    setNombre(s.name);
                    setIcono(s.icon);
                    setColor(s.color);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <FieldLabel>Ícono</FieldLabel>
          <View style={styles.wrap}>
            {ICONOS.map((i) => (
              <Pressable
                key={i}
                onPress={() => setIcono(i)}
                accessibilityRole="radio"
                accessibilityState={{ selected: icono === i }}
                accessibilityLabel={i}
                style={[
                  styles.iconBtn,
                  { backgroundColor: icono === i ? `${color}33` : colors.surface, borderColor: icono === i ? color : colors.border },
                ]}
              >
                <Ionicons name={i as keyof typeof Ionicons.glyphMap} size={20} color={icono === i ? color : colors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <FieldLabel>Color</FieldLabel>
          <View style={styles.wrap}>
            {COLORES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: color === c }}
                accessibilityLabel={`Color ${c}`}
                hitSlop={4}
                style={[styles.color, { backgroundColor: c, borderColor: color === c ? colors.text : 'transparent' }]}
              />
            ))}
          </View>
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Crear hábito'} onPress={guardar} disabled={!nombre.trim()} />
          {id ? <Button label="Eliminar hábito" variant="danger" onPress={borrar} /> : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  iconBtn: { width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  color: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
});
