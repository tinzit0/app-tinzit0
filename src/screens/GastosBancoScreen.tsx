/**
 * Gastos automáticos desde los avisos del banco:
 * - Activar el permiso (con la explicación de "ajustes restringidos" de Android 13+)
 * - Modo: "Preguntarme" (revisas cada uno) o "Anotar solo"
 * - Lista de gastos detectados por revisar (con categoría cambiable)
 * - Probar un aviso pegando su texto, y ver los avisos que no se entendieron
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Avisos } from '../../modules/tinzit0-avisos';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CategoryIcon } from '@/components/CategoryIcon';
import { SegmentedControl } from '@/components/SegmentedControl';
import { aceptarAviso, descartarAviso, listarAvisos, modoGastosAuto, type AvisoGuardado, type ModoAuto } from '@/database/finanzas';
import { setSetting } from '@/database/queries';
import { interpretarAviso, nombreBanco } from '@/finanzas/banco';
import { permisoAvisos, sincronizarAvisos } from '@/finanzas/sincronizar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';
import { CATEGORIAS, categoria } from '@/utils/categorias';
import { fechaCorta } from '@/utils/fechas';
import { formatCLP } from '@/utils/moneda';

const hora = (ts: number) => {
  const d = new Date(ts);
  return `${fechaCorta(d)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function GastosBancoScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [permiso, setPermiso] = useState(false);
  const [modo, setModo] = useState<ModoAuto>('preguntar');
  const [pendientes, setPendientes] = useState<AvisoGuardado[]>([]);
  const [recientes, setRecientes] = useState<AvisoGuardado[]>([]);
  const [ignorados, setIgnorados] = useState<AvisoGuardado[]>([]);
  const [cats, setCats] = useState<Record<number, string>>({});
  const [prueba, setPrueba] = useState('');
  const [verIgnorados, setVerIgnorados] = useState(false);

  const cargar = useCallback(async () => {
    setPermiso(permisoAvisos());
    await sincronizarAvisos(db);
    const [m, p, r, ig] = await Promise.all([
      modoGastosAuto(db),
      listarAvisos(db, ['pendiente']),
      listarAvisos(db, ['agregado'], 10),
      listarAvisos(db, ['ignorado'], 15),
    ]);
    setModo(m);
    setPendientes(p);
    setRecientes(r);
    setIgnorados(ig);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(console.warn);
      // Al volver de los Ajustes de Android, revisamos si ya diste el permiso.
      const sub = AppState.addEventListener('change', (e) => e === 'active' && cargar().catch(console.warn));
      return () => sub.remove();
    }, [cargar]),
  );

  const activar = () => {
    if (!Avisos) {
      Alert.alert('No disponible', 'Los gastos automáticos funcionan en la app instalada (APK), no en Expo Go.');
      return;
    }
    Alert.alert(
      'Activar gastos automáticos',
      'Se abrirá "Acceso a notificaciones". Busca Tinzit0 y actívalo.\n\nTinzit0 solo lee los avisos de apps de bancos (todo lo demás se ignora) y nada sale de tu celular.\n\nSi Android dice "Ajuste restringido", toca "Abrir info de la app" aquí abajo, luego ⋮ (arriba a la derecha) → "Permitir ajustes restringidos", y vuelve a intentar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir info de la app', onPress: () => Avisos?.abrirInfoApp() },
        { text: 'Continuar', onPress: () => Avisos?.abrirAjustesPermiso() },
      ],
    );
  };

  const cambiarModo = async (m: ModoAuto) => {
    setModo(m);
    await setSetting(db, 'gastos_auto_modo', m);
  };

  const aceptar = async (a: AvisoGuardado) => {
    await aceptarAviso(db, a.id, cats[a.id]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await cargar();
  };

  const aceptarTodos = async () => {
    for (const a of pendientes) if (a.monto) await aceptarAviso(db, a.id, cats[a.id]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await cargar();
  };

  const cicloCategoria = (a: AvisoGuardado) => {
    const actual = cats[a.id] ?? a.categoria ?? 'otros';
    const k = CATEGORIAS.findIndex((c) => c.key === actual);
    setCats((c) => ({ ...c, [a.id]: CATEGORIAS[(k + 1) % CATEGORIAS.length].key }));
    Haptics.selectionAsync().catch(() => {});
  };

  const resultadoPrueba = prueba.trim() ? interpretarAviso({ title: '', text: prueba }) : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Gastos del banco' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Estado */}
        <Card style={[styles.fila, permiso ? { backgroundColor: colors.accentSoft, borderColor: 'transparent' } : null]}>
          <Ionicons name={permiso ? 'checkmark-circle' : 'notifications-off-outline'} size={24} color={permiso ? colors.accent : colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <AppText variant="headline">{permiso ? 'Activado' : 'Desactivado'}</AppText>
            <AppText variant="caption" tone="secondary">
              {permiso
                ? 'Cuando tu banco te avise de una compra, la anoto. Se procesa al abrir Tinzit0.'
                : 'Anoto tus compras leyendo los avisos de tu banco: BancoEstado, Falabella, Santander, BCI, Banco de Chile, Tenpo, Mercado Pago y otros.'}
            </AppText>
          </View>
        </Card>
        {!permiso ? <Button label="Activar gastos automáticos" onPress={activar} style={{ marginTop: space.md }} /> : null}

        {/* Modo */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Cuando detecte una compra</AppText>
          <SegmentedControl<ModoAuto>
            value={modo}
            onChange={cambiarModo}
            options={[
              { value: 'preguntar', label: 'Preguntarme' },
              { value: 'auto', label: 'Anotar solo' },
            ]}
          />
          <AppText variant="caption" tone="tertiary" style={{ marginTop: space.sm }}>
            {modo === 'auto' ? 'Las compras se anotan solas. Las transferencias igual te las pregunto.' : 'Revisas cada compra antes de anotarla.'}
          </AppText>
        </View>

        {/* Por revisar */}
        <View style={styles.seccion}>
          <View style={styles.cabecera}>
            <AppText variant="overline" tone="tertiary">Por revisar</AppText>
            {pendientes.length > 1 ? (
              <Pressable onPress={aceptarTodos} hitSlop={8} accessibilityRole="button" accessibilityLabel="Anotar todos">
                <AppText variant="caption" tone="accent">Anotar todos</AppText>
              </Pressable>
            ) : null}
          </View>
          {pendientes.length ? (
            <View style={{ gap: space.sm }}>
              {pendientes.map((a) => {
                const cat = cats[a.id] ?? a.categoria ?? 'otros';
                return (
                  <View key={a.id} style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.fila}>
                      <Pressable onPress={() => cicloCategoria(a)} accessibilityRole="button" accessibilityLabel={`Categoría ${categoria(cat).label}, toca para cambiar`}>
                        <CategoryIcon cat={cat} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <AppText variant="callout" numberOfLines={1}>{a.comercio ?? (a.tipo === 'transferencia' ? 'Transferencia' : 'Compra')}</AppText>
                        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
                          {nombreBanco(a.pkg)} · {hora(a.ts)} · {categoria(cat).label}
                        </AppText>
                      </View>
                      <AppText variant="headline" tabular>{formatCLP(a.monto ?? 0)}</AppText>
                    </View>
                    <View style={[styles.fila, { marginTop: space.md }]}>
                      <Button label="No es gasto" variant="secondary" onPress={async () => { await descartarAviso(db, a.id); await cargar(); }} style={{ flex: 1 }} />
                      <Button label="Anotar" onPress={() => aceptar(a)} style={{ flex: 1 }} />
                    </View>
                  </View>
                );
              })}
              <AppText variant="caption" tone="tertiary">Toca el ícono para cambiar la categoría.</AppText>
            </View>
          ) : (
            <AppText variant="callout" tone="secondary">Nada por revisar. 🙌</AppText>
          )}
        </View>

        {/* Recientes */}
        {recientes.length ? (
          <View style={styles.seccion}>
            <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Anotados del banco</AppText>
            <Card style={{ paddingVertical: space.sm }}>
              {recientes.map((a, k) => (
                <View key={a.id} style={[styles.fila, styles.linea, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <CategoryIcon cat={a.categoria ?? 'otros'} size={32} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="callout" numberOfLines={1}>{a.comercio ?? 'Compra'}</AppText>
                    <AppText variant="caption" tone="tertiary">{nombreBanco(a.pkg)} · {hora(a.ts)}</AppText>
                  </View>
                  <AppText variant="callout" tabular>{formatCLP(a.monto ?? 0)}</AppText>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {/* Probar */}
        <View style={styles.seccion}>
          <AppText variant="overline" tone="tertiary" style={{ marginBottom: space.md }}>Probar con un aviso</AppText>
          <TextInput
            value={prueba}
            onChangeText={setPrueba}
            multiline
            placeholder="Pega aquí el texto de un aviso de tu banco"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Texto de un aviso del banco"
            style={[type.body, styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
          {resultadoPrueba ? (
            <AppText variant="callout" tone={resultadoPrueba.tipo === 'ignorar' ? 'warning' : 'accent'} style={{ marginTop: space.sm }}>
              {resultadoPrueba.tipo === 'ignorar'
                ? `No lo anotaría (${resultadoPrueba.motivo}).`
                : `${resultadoPrueba.tipo === 'compra' ? 'Compra' : 'Transferencia'} de ${formatCLP(resultadoPrueba.monto)}${resultadoPrueba.comercio ? ` en ${resultadoPrueba.comercio}` : ''} → ${categoria(resultadoPrueba.categoria).label}`}
            </AppText>
          ) : null}
        </View>

        {/* No entendidos */}
        {ignorados.length ? (
          <View style={styles.seccion}>
            <Pressable onPress={() => setVerIgnorados((v) => !v)} accessibilityRole="button" style={styles.cabecera}>
              <AppText variant="overline" tone="tertiary">Avisos que no anoté ({ignorados.length})</AppText>
              <Ionicons name={verIgnorados ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
            </Pressable>
            {verIgnorados ? (
              <View style={{ gap: space.sm }}>
                <AppText variant="caption" tone="tertiary">
                  Si alguno SÍ era una compra, copia el texto y mándamelo para enseñarle a Tinzit0 ese formato.
                </AppText>
                {ignorados.map((a) => (
                  <View key={a.id} style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <AppText variant="caption" tone="tertiary">{nombreBanco(a.pkg)} · {hora(a.ts)}</AppText>
                    <AppText variant="callout" selectable>{[a.title, a.text].filter(Boolean).join(' — ')}</AppText>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  seccion: { marginTop: space.xxl },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  linea: { paddingVertical: space.md },
  item: { padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  input: { minHeight: 90, borderRadius: radius.md, borderWidth: 1, padding: space.lg, textAlignVertical: 'top' },
});
