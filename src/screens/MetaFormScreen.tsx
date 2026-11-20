/**
 * Crear o editar una meta de ahorro.
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { MontoInput } from '@/components/MontoInput';
import { actualizarMeta, crearMeta, eliminarMeta, obtenerMeta } from '@/database/metas';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { fechaLarga, fromISODate, toISODate } from '@/utils/fechas';

export function MetaFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState(0);
  const [fecha, setFecha] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    obtenerMeta(db, id).then((m) => {
      if (!m) return;
      setNombre(m.name);
      setObjetivo(m.target);
      setFecha(m.deadline);
    });
  }, [db, id]);

  const elegirFecha = () => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: fecha ? fromISODate(fecha) : new Date(Date.now() + 90 * 86400000),
      mode: 'date',
      minimumDate: new Date(),
      onChange: (e, d) => e.type === 'set' && d && setFecha(toISODate(d)),
    });
  };

  const valido = nombre.trim().length > 0 && objetivo > 0;

  const guardar = async () => {
    if (!valido) return;
    const datos = { name: nombre, target: objetivo, deadline: fecha };
    if (id) {
      await actualizarMeta(db, id, datos);
      router.back();
    } else {
      const nuevo = await crearMeta(db, datos);
      router.replace({ pathname: '/meta', params: { id: String(nuevo) } });
    }
  };

  const borrar = () =>
    Alert.alert('¿Eliminar meta?', 'Se borran también sus abonos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (id) await eliminarMeta(db, id);
          router.dismissTo('/metas');
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar meta' : 'Nueva meta' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field big value={nombre} onChangeText={setNombre} placeholder="¿Para qué ahorras?" autoFocus={!id} maxLength={40} accessibilityLabel="Nombre de la meta" />

        <View style={styles.section}>
          <FieldLabel>Monto objetivo</FieldLabel>
          <MontoInput value={objetivo} onChange={setObjetivo} accessibilityLabel="Monto objetivo" />
        </View>

        <View style={styles.section}>
          <FieldLabel>Fecha límite (opcional)</FieldLabel>
          <View style={styles.chips}>
            <Chip label="Sin fecha" selected={!fecha} onPress={() => setFecha(null)} />
            <Chip label={fecha ? fechaLarga(fromISODate(fecha)) : 'Elegir fecha'} selected={!!fecha} onPress={elegirFecha} />
          </View>
          {fecha ? (
            <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm, marginLeft: space.xs }}>
              Te calculo cuánto ahorrar a la semana para llegar.
            </AppText>
          ) : null}
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Crear meta'} onPress={guardar} disabled={!valido} />
          {id ? <Button label="Eliminar meta" variant="danger" onPress={borrar} /> : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
