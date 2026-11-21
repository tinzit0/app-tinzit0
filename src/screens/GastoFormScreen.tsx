/**
 * Anotar o editar un gasto: monto grande, categoría, fecha y nota.
 * Al guardar revisa el presupuesto y te avisa si cruzaste el 80% o el 100%.
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Chip } from '@/components/Chip';
import { Field, FieldLabel } from '@/components/Field';
import { PressableScale } from '@/components/PressableScale';
import {
  actualizarGasto,
  avisoPresupuesto,
  crearGasto,
  eliminarGasto,
  obtenerGasto,
  presupuestoSemanal,
  rangoSemana,
  totalEnRango,
} from '@/database/gastos';
import { hayGastoParecido } from '@/database/presupuestos';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';
import { CATEGORIAS } from '@/utils/categorias';
import { fechaCorta, fechaLarga, fromISODate, haceDias, toISODate } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';
import { soloDigitos } from '@/utils/montos';

export function GastoFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  // Vuelve atrás; si no hay pantalla anterior (ej: se abrió por enlace), va al inicio.
  const cerrar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string; monto?: string; cat?: string; nota?: string; fecha?: string }>();
  const id = params.id ? Number(params.id) : null;

  // Pre-llenado (ej: desde una boleta escaneada) como valor inicial.
  const pre = !id;
  const [digitos, setDigitos] = useState(() => (pre && params.monto && /^\d+$/.test(params.monto) ? params.monto : '')); // el monto como texto de solo números
  const [cat, setCat] = useState(() => (pre && params.cat ? params.cat : 'comida'));
  const [nota, setNota] = useState(() => (pre && params.nota ? params.nota : ''));
  const [fecha, setFecha] = useState(() => (pre && params.fecha && /^\d{4}-\d{2}-\d{2}$/.test(params.fecha) ? params.fecha : toISODate()));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!id) return;
    obtenerGasto(db, id).then((g) => {
      if (!g) return;
      setDigitos(String(g.amount));
      setCat(g.category);
      setNota(g.note ?? '');
      setFecha(g.date);
    });
  }, [db, id]);

  const monto = Number(digitos || 0);
  const hoy = toISODate();
  const ayer = toISODate(haceDias(1));

  const elegirFecha = () => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: fromISODate(fecha),
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, d) => e.type === 'set' && d && setFecha(toISODate(d)),
    });
  };

  /** Antes de anotar uno nuevo: ¿ya hay uno igual (mismo monto, ±1 día)? Puede venir del banco o una boleta. */
  const intentarGuardar = async () => {
    if (monto <= 0 || guardando) return;
    if (!id) {
      const parecido = await hayGastoParecido(db, monto, fecha).catch(() => null);
      if (parecido) {
        Alert.alert(
          '¿Ya lo anotaste?',
          `Hay un gasto de ${formatCLP(parecido.amount)} el ${fechaCorta(fromISODate(parecido.date))}${parecido.note ? ` (${parecido.note})` : ''}. Puede venir del banco o de una boleta.`,
          [
            { text: 'No anotar', style: 'cancel' },
            { text: 'Anotar igual', onPress: () => guardar().catch(console.warn) },
          ],
        );
        return;
      }
    }
    await guardar();
  };

  const guardar = async () => {
    if (monto <= 0) return;
    setGuardando(true);
    try {
      const semana = rangoSemana(fromISODate(fecha));
      const esEstaSemana = semana.desde === rangoSemana().desde;
      const antes = await totalEnRango(db, semana);
      const datos = { amount: monto, category: cat, note: nota, date: fecha };
      if (id) await actualizarGasto(db, id, datos);
      else await crearGasto(db, datos);

      // Aviso del presupuesto (solo para gastos nuevos de esta semana).
      if (!id && esEstaSemana) {
        const despues = await totalEnRango(db, semana);
        const aviso = avisoPresupuesto(antes, despues, await presupuestoSemanal(db));
        if (aviso) Alert.alert('Presupuesto', aviso);
      }
      cerrar();
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () => {
    if (!id) return;
    Alert.alert('¿Eliminar gasto?', 'Esto no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarGasto(db, id);
          cerrar();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Editar gasto' : 'Nuevo gasto' }} />
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Monto: se muestra formateado ($12.990) pero escribes solo números */}
        <View style={styles.amountWrap}>
          <TextInput
            value={monto > 0 ? formatCLP(monto) : ''}
            onChangeText={(t) => setDigitos(soloDigitos(t).slice(0, 10))}
            placeholder="$0"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            autoFocus={!id}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            accessibilityLabel="Monto en pesos"
            maxFontSizeMultiplier={1.2}
            style={[styles.amount, { color: colors.text }]}
          />
          <AppText variant="caption" tone="tertiary">Pesos chilenos</AppText>
        </View>

        <View style={styles.section}>
          <FieldLabel>Categoría</FieldLabel>
          <View style={styles.grid}>
            {CATEGORIAS.map((c) => {
              const sel = c.key === cat;
              return (
                <PressableScale
                  key={c.key}
                  onPress={() => setCat(c.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={c.label}
                  style={[
                    styles.catItem,
                    {
                      backgroundColor: colors.surface,
                      borderColor: sel ? colors.text : colors.border,
                      borderWidth: sel ? 1.5 : 1,
                    },
                  ]}
                >
                  <CategoryIcon cat={c.key} size={34} />
                  <AppText variant="caption" tone={sel ? 'primary' : 'secondary'} numberOfLines={1}>
                    {c.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <FieldLabel>Fecha</FieldLabel>
          <View style={styles.chips}>
            <Chip label="Hoy" selected={fecha === hoy} onPress={() => setFecha(hoy)} />
            <Chip label="Ayer" selected={fecha === ayer} onPress={() => setFecha(ayer)} />
            <Chip
              label={fecha !== hoy && fecha !== ayer ? fechaLarga(fromISODate(fecha)) : 'Otra fecha'}
              selected={fecha !== hoy && fecha !== ayer}
              onPress={elegirFecha}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Field
            label="Nota"
            value={nota}
            onChangeText={setNota}
            placeholder="Ej: almuerzo con los cabros"
            maxLength={80}
            returnKeyType="done"
          />
        </View>

        <View style={[styles.section, { gap: space.md }]}>
          <Button label={id ? 'Guardar cambios' : 'Anotar gasto'} onPress={intentarGuardar} disabled={monto <= 0} loading={guardando} />
          {id ? <Button label="Eliminar" variant="danger" onPress={borrar} /> : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  amountWrap: { alignItems: 'center', paddingVertical: space.xl, gap: space.xs },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 52,
    letterSpacing: -2,
    textAlign: 'center',
    minWidth: 200,
    fontVariant: ['tabular-nums'],
  },
  section: { marginTop: space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  catItem: {
    width: '31.5%',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
