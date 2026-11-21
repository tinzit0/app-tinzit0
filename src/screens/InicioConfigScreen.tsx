/**
 * Ordenar Inicio: muestra u oculta cada módulo y cambia su orden con las flechas.
 * Se guarda en el ajuste "inicio_modulos".
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { getSetting, setSetting } from '@/database/queries';
import { alternar, leerModulos, MODULOS, mover, porDefecto, type IdModulo, type ModuloInicio } from '@/inicio/modulos';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function InicioConfigScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [lista, setLista] = useState<ModuloInicio[]>(() => leerModulos(null));

  useEffect(() => {
    let vivo = true;
    getSetting(db, 'inicio_modulos')
      .then((v) => vivo && setLista(leerModulos(v)))
      .catch(console.warn);
    return () => {
      vivo = false;
    };
  }, [db]);

  const guardar = (nueva: ModuloInicio[]) => {
    const anterior = lista;
    setLista(nueva);
    setSetting(db, 'inicio_modulos', JSON.stringify(nueva)).catch(() => setLista(anterior)); // si falla, vuelve atrás
  };

  const info = (id: IdModulo) => MODULOS.find((m) => m.id === id)!;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Ordenar Inicio' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <AppText variant="callout" tone="secondary" style={{ marginBottom: space.lg }}>
          Elige qué ver en Inicio y en qué orden. Lo oculto sigue funcionando: solo no aparece en la pantalla.
        </AppText>
        <Card style={{ paddingVertical: space.xs }}>
          {lista.map((m, k) => {
            const d = info(m.id);
            return (
              <View key={m.id} style={[styles.fila, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="callout" tone={m.visible ? 'primary' : 'tertiary'}>{d.nombre}</AppText>
                  <AppText variant="caption" tone="tertiary" numberOfLines={1}>{d.detalle}</AppText>
                </View>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Subir ${d.nombre}`}
                  disabled={k === 0}
                  onPress={() => guardar(mover(lista, m.id, -1))}
                  hitSlop={6}
                  style={[styles.flecha, { opacity: k === 0 ? 0.3 : 1 }]}
                >
                  <Ionicons name="chevron-up" size={20} color={colors.textSecondary} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Bajar ${d.nombre}`}
                  disabled={k === lista.length - 1}
                  onPress={() => guardar(mover(lista, m.id, 1))}
                  hitSlop={6}
                  style={[styles.flecha, { opacity: k === lista.length - 1 ? 0.3 : 1 }]}
                >
                  <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                </PressableScale>
                <Switch
                  value={m.visible}
                  onValueChange={() => guardar(alternar(lista, m.id))}
                  trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel={`Mostrar ${d.nombre} en Inicio`}
                />
              </View>
            );
          })}
        </Card>
        <Button label="Volver al orden original" variant="secondary" onPress={() => guardar(porDefecto())} style={{ marginTop: space.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: space.xxxl * 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  flecha: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
