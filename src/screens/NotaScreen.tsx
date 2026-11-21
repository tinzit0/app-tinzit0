/**
 * Editor de una nota. Se guarda solo mientras escribes (y al salir).
 * La primera línea funciona como título.
 *
 * Los guardados van EN FILA (uno detrás de otro): así una nota nueva nunca se inserta dos veces
 * aunque escribas rápido o salgas justo mientras guardaba. Arriba se ve "Guardando…", "Guardado"
 * o un error con "Reintentar".
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';

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
  const [estado, setEstado] = useState<'listo' | 'guardando' | 'guardado' | 'error'>('listo');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fila = useRef<Promise<void>>(Promise.resolve());
  const guardadoRef = useRef<string | null>(null); // último texto que quedó en la base
  const eliminada = useRef(false);
  const montada = useRef(true);
  // Mientras carga una nota existente no se guarda nada (para no pisarla con el texto vacío).
  const cargada = useRef(!params.id);

  useEffect(() => {
    if (!idRef.current) return;
    obtenerNota(db, idRef.current)
      .then((n) => {
        if (n) {
          setTexto(n.body);
          textoRef.current = n.body;
          guardadoRef.current = n.body;
          setFijada(!!n.pinned);
        }
        cargada.current = true;
      })
      .catch(() => {
        cargada.current = true;
        setEstado('error');
      });
  }, [db]);

  // Guardado: medio segundo después de dejar de escribir, y al salir de la pantalla. En fila.
  const guardarAhora = () => {
    if (timer.current) clearTimeout(timer.current);
    const paso = async () => {
      if (eliminada.current || !cargada.current) return;
      const cuerpo = textoRef.current;
      if (cuerpo.trim() === (guardadoRef.current ?? '').trim()) return; // nada nuevo
      if (montada.current) setEstado('guardando');
      try {
        idRef.current = await guardarNota(db, idRef.current, cuerpo);
        guardadoRef.current = cuerpo;
        if (montada.current) setEstado('guardado');
      } catch (e) {
        if (montada.current) setEstado('error');
        throw e;
      }
    };
    const r = fila.current.then(paso, paso);
    fila.current = r.catch(() => undefined);
    return r;
  };

  useEffect(
    () => () => {
      montada.current = false;
      guardarAhora().catch(console.warn);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onChange = (t: string) => {
    setTexto(t);
    textoRef.current = t;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      guardarAhora().catch(console.warn);
    }, 500);
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
          eliminada.current = true; // ningún guardado pendiente vuelve a crearla
          await fila.current;
          try {
            if (idRef.current) await eliminarNota(db, idRef.current);
          } catch {
            eliminada.current = false;
            Alert.alert('No se pudo eliminar', 'Inténtalo de nuevo.');
            return;
          }
          idRef.current = null;
          textoRef.current = '';
          if (router.canGoBack()) router.back();
          else router.replace('/notas');
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
              {estado === 'error' ? (
                <Pressable onPress={() => guardarAhora().catch(() => {})} hitSlop={8} accessibilityRole="button" accessibilityLabel="No se guardó. Reintentar">
                  <AppText variant="caption" tone="danger">Reintentar</AppText>
                </Pressable>
              ) : estado !== 'listo' ? (
                <AppText variant="caption" tone="tertiary" accessibilityLiveRegion="polite">
                  {estado === 'guardando' ? 'Guardando…' : 'Guardado'}
                </AppText>
              ) : null}
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xl, paddingRight: space.xs },
});
