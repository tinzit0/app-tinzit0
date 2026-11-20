/**
 * Editor de una nota. Se guarda solo mientras escribes (y al salir).
 * La primera línea funciona como título.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { eliminarNota, fijarNota, guardarNota, obtenerNota } from '@/database/notas';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type } from '@/theme/tokens';

export function NotaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();

  const idRef = useRef<number | null>(params.id ? Number(params.id) : null);
  const textoRef = useRef('');
  const [texto, setTexto] = useState('');
  const [fijada, setFijada] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!idRef.current) return;
    obtenerNota(db, idRef.current).then((n) => {
      if (!n) return;
      setTexto(n.body);
      textoRef.current = n.body;
      setFijada(!!n.pinned);
    });
  }, [db]);

  // Guardado: medio segundo después de dejar de escribir, y al salir de la pantalla.
  const guardarAhora = async () => {
    if (timer.current) clearTimeout(timer.current);
    idRef.current = await guardarNota(db, idRef.current, textoRef.current);
  };

  useEffect(() => () => {
    guardarAhora().catch(console.warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (t: string) => {
    setTexto(t);
    textoRef.current = t;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => guardarAhora().catch(console.warn), 500);
  };

  const togglePin = async () => {
    await guardarAhora();
    if (!idRef.current) return;
    await fijarNota(db, idRef.current, !fijada);
    setFijada(!fijada);
  };

  const borrar = () => {
    Alert.alert('¿Eliminar nota?', 'Esto no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (timer.current) clearTimeout(timer.current);
          if (idRef.current) await eliminarNota(db, idRef.current);
          idRef.current = null;
          textoRef.current = '';
          router.canGoBack() ? router.back() : router.replace('/notas');
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.actions}>
              <Pressable onPress={togglePin} hitSlop={10} accessibilityRole="button" accessibilityLabel={fijada ? 'Desfijar' : 'Fijar arriba'}>
                <Ionicons name={fijada ? 'pin' : 'pin-outline'} size={21} color={fijada ? colors.accent : colors.text} />
              </Pressable>
              <Pressable onPress={borrar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Eliminar nota">
                <Ionicons name="trash-outline" size={21} color={colors.text} />
              </Pressable>
            </View>
          ),
        }}
      />
      <TextInput
        value={texto}
        onChangeText={onChange}
        multiline
        autoFocus={!params.id}
        placeholder={'Título\nY lo que quieras anotar…'}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        textAlignVertical="top"
        accessibilityLabel="Texto de la nota"
        style={[type.body, styles.input, { color: colors.text, backgroundColor: colors.bg }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: { flex: 1, padding: space.xl, fontSize: 17, lineHeight: 26 },
  actions: { flexDirection: 'row', gap: space.xl, paddingRight: space.xs },
});
