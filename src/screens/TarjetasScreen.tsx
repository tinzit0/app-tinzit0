/**
 * Tarjetas de memoria: crear a mano, crear desde tus notas (con la IA del celular si la
 * descargaste; si no, reconociendo "término: definición"), y repasar con repetición espaciada.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import {
  crearTarjetas,
  eliminarTarjeta,
  listarRamosSimple,
  listarTarjetas,
  tarjetasParaHoy,
  type Ramo,
  type Tarjeta,
} from '@/database/estudio';
import { listarNotas, type Nota } from '@/database/notas';
import { tarjetasConIA } from '@/estudio/conIA';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { fechaCorta, fromISODate, toISODate } from '@/utils/fechas';

export function TarjetasScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ ramo?: string }>();

  const [ramos, setRamos] = useState<Ramo[]>([]);
  // undefined = todas · null = sin ramo · número = ese ramo
  const [filtro, setFiltro] = useState<number | null | undefined>(params.ramo ? Number(params.ramo) : undefined);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [frente, setFrente] = useState('');
  const [reverso, setReverso] = useState('');
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [generando, setGenerando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const [r, t, p] = await Promise.all([listarRamosSimple(db), listarTarjetas(db, filtro), tarjetasParaHoy(db, filtro)]);
    setRamos(r);
    setTarjetas(t);
    setPendientes(p.length);
  }, [db, filtro]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
    }, [cargar]),
  );

  const ramoDestino = typeof filtro === 'number' ? filtro : null;

  const agregar = async () => {
    if (!frente.trim() || !reverso.trim()) return;
    await crearTarjetas(db, ramoDestino, [{ front: frente, back: reverso }]);
    setFrente('');
    setReverso('');
    await cargar();
  };

  const desdeNota = async (n: Nota) => {
    setGenerando(n.id);
    try {
      const { tarjetas: nuevas, conIA } = await tarjetasConIA(db, n.body);
      if (!nuevas.length) {
        Alert.alert(
          'No encontré definiciones',
          'Escribe tus apuntes como "Término: definición" (una por línea), o descarga la IA en Ajustes para que las arme sola.',
        );
        return;
      }
      Alert.alert(`${nuevas.length} tarjetas listas`, `${conIA ? 'La IA armó' : 'Armé'} estas preguntas:\n\n${nuevas.slice(0, 4).map((t) => `• ${t.front}`).join('\n')}${nuevas.length > 4 ? '\n…' : ''}`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            await crearTarjetas(db, ramoDestino, nuevas);
            setNotas(null);
            await cargar();
          },
        },
      ]);
    } finally {
      setGenerando(null);
    }
  };

  const nombreRamo = (id: number | null) => ramos.find((r) => r.id === id)?.name;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Tarjetas' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Filtro por ramo */}
        {ramos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginHorizontal: -space.xl }}>
            <Chip compact label="Todas" selected={filtro === undefined} onPress={() => setFiltro(undefined)} />
            {ramos.map((r) => (
              <Chip key={r.id} compact label={r.name} selected={filtro === r.id} onPress={() => setFiltro(r.id)} leading={<View style={[styles.punto, { backgroundColor: r.color }]} />} />
            ))}
            <Chip compact label="Sin ramo" selected={filtro === null} onPress={() => setFiltro(null)} />
          </ScrollView>
        ) : null}

        {/* Repaso de hoy */}
        <Card style={{ marginTop: space.lg }}>
          <AppText variant="overline" tone="tertiary">Para repasar hoy</AppText>
          <AppText variant="display" tabular style={{ marginTop: space.xs }}>{pendientes}</AppText>
          <AppText variant="callout" tone="secondary">
            {pendientes ? 'Te muestro cada tarjeta justo antes de que se te olvide.' : tarjetas.length ? 'Todo al día. Vuelve mañana 🙌' : 'Crea tu primera tarjeta abajo.'}
          </AppText>
          {pendientes ? (
            <Button
              label={`Repasar ${pendientes} ${pendientes === 1 ? 'tarjeta' : 'tarjetas'}`}
              onPress={() => router.push({ pathname: '/repaso', params: filtro === undefined ? {} : { ramo: filtro === null ? 'sin' : String(filtro) } })}
              style={{ marginTop: space.lg }}
            />
          ) : null}
        </Card>

        {/* Nueva tarjeta */}
        <View style={styles.section}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>
            Nueva tarjeta{ramoDestino ? ` · ${nombreRamo(ramoDestino)}` : ''}
          </AppText>
          <View style={{ gap: space.md }}>
            <Field value={frente} onChangeText={setFrente} placeholder="Pregunta (ej: ¿Qué es la mitocondria?)" maxLength={200} multiline accessibilityLabel="Pregunta" />
            <Field value={reverso} onChangeText={setReverso} placeholder="Respuesta" maxLength={500} multiline accessibilityLabel="Respuesta" />
            <Button label="Agregar tarjeta" onPress={agregar} disabled={!frente.trim() || !reverso.trim()} />
            <Button
              label={notas ? 'Ocultar notas' : 'Crear desde una nota'}
              variant="secondary"
              onPress={async () => setNotas(notas ? null : await listarNotas(db))}
            />
          </View>
          {notas ? (
            <View style={{ gap: space.sm, marginTop: space.md }}>
              {notas.length ? (
                notas.slice(0, 15).map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => desdeNota(n)}
                    disabled={generando != null}
                    accessibilityLabel={`Crear tarjetas desde la nota ${n.body.split('\n')[0]}`}
                    style={[styles.nota, { backgroundColor: colors.surface, borderColor: colors.border, opacity: generando != null && generando !== n.id ? 0.5 : 1 }]}
                  >
                    <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
                    <AppText variant="callout" numberOfLines={1} style={{ flex: 1 }}>{n.body.split('\n')[0]}</AppText>
                    <AppText variant="caption" tone="accent">{generando === n.id ? 'Creando…' : 'Usar'}</AppText>
                  </Pressable>
                ))
              ) : (
                <AppText variant="callout" tone="secondary">No tienes notas. Escanea tus apuntes o graba una clase y quedan como nota.</AppText>
              )}
            </View>
          ) : null}
        </View>

        {/* Lista */}
        <View style={styles.section}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>
            {tarjetas.length} {tarjetas.length === 1 ? 'tarjeta' : 'tarjetas'}
          </AppText>
          {!tarjetas.length ? (
            <EmptyState icon="albums-outline" title="Sin tarjetas" description="Las tarjetas te ayudan a memorizar: pregunta adelante, respuesta atrás." />
          ) : (
            <View style={{ gap: space.sm }}>
              {tarjetas.map((t) => (
                <View key={t.id} style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="callout" numberOfLines={2}>{t.front}</AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>{t.back}</AppText>
                    <AppText variant="caption" tone="tertiary" style={{ marginTop: space.xs }}>
                      {t.due <= toISODate() ? 'Para hoy' : `Próximo repaso: ${fechaCorta(fromISODate(t.due))}`}
                      {filtro === undefined && t.course_id ? ` · ${nombreRamo(t.course_id) ?? ''}` : ''}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() =>
                      Alert.alert('¿Borrar tarjeta?', t.front, [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Borrar', style: 'destructive', onPress: async () => { await eliminarTarjeta(db, t.id); await cargar(); } },
                      ])
                    }
                    accessibilityLabel="Borrar tarjeta"
                    hitSlop={10}
                    style={styles.borrar}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  chips: { gap: space.sm, paddingHorizontal: space.xl },
  punto: { width: 10, height: 10, borderRadius: 5 },
  section: { marginTop: space.xxl },
  nota: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1, minHeight: 48 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1 },
  borrar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
