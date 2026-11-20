/**
 * Crear o editar un gasto fijo mensual.
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { MontoInput } from '@/components/MontoInput';
import { Stepper } from '@/components/Stepper';
import { actualizarFijo, crearFijo, eliminarFijo, obtenerFijo } from '@/database/fijos';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { CATEGORIAS } from '@/utils/categorias';

export function FijoFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;
  const cerrar = () => (router.canGoBack() ? router.back() : router.replace('/gastos'));

  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState(0);
  const [cat, setCat] = useState('suscripciones');
  const [dia, setDia] = useState(new Date().getDate());
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    if (!id) return;
    obtenerFijo(db, id).then((f) => {
      if (!f) return;
      setNombre(f.name);
      setMonto(f.amount);
      setCat(f.category);
      setDia(f.day_of_month);
      setActivo(!!f.active);
    });
  }, [db, id]);

  const valido = nombre.trim().length > 0 && monto > 0;

  const guardar = async () => {
    if (!valido) return;
    const datos = { name: nombre, amount: monto, category: cat, day_of_month: dia };
    if (id) await actualizarFijo(db, id, { ...datos, active: activo });
    else await crearFijo(db, datos);
    cerrar();
  };

  const borrar = () =>
    Alert.alert('¿Eliminar gasto fijo?', 'Los gastos que ya se sumaron se mantienen.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (id) await eliminarFijo(db, id);
          cerrar();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar gasto fijo' : 'Nuevo gasto fijo' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <MontoInput value={monto} onChange={setMonto} autoFocus={!id} accessibilityLabel="Monto mensual" />
        <AppText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>al mes</AppText>

        <View style={styles.section}>
          <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Ej: Arriendo, Spotify, Plan celular" maxLength={40} />
        </View>

        <View style={styles.section}>
          <FieldLabel>Categoría</FieldLabel>
          <View style={styles.chips}>
            {CATEGORIAS.map((c) => (
              <Chip key={c.key} label={c.label} selected={cat === c.key} onPress={() => setCat(c.key)} />
            ))}
          </View>
        </View>

        <View style={[styles.section, { flexDirection: 'row' }]}>
          <Stepper label="Día de pago" value={dia} onChange={(n) => setDia(Math.min(31, Math.max(1, n)))} min={1} />
        </View>
        {dia > 28 ? (
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm, marginLeft: space.xs }}>
            En meses más cortos se cobra el último día.
          </AppText>
        ) : null}

        {id ? (
          <View style={[styles.section, styles.switchRow]}>
            <AppText variant="callout" style={{ flex: 1 }}>Activo</AppText>
            <Switch
              value={activo}
              onValueChange={setActivo}
              trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
              thumbColor={activo ? colors.onAccent : '#f4f4f4'}
              accessibilityLabel="Gasto fijo activo"
            />
          </View>
        ) : null}

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Agregar gasto fijo'} onPress={guardar} disabled={!valido} />
          {id ? <Button label="Eliminar" variant="danger" onPress={borrar} /> : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  section: { marginTop: space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
