/**
 * Sección de notificaciones de Ajustes:
 * encender/apagar cada aviso y elegir su hora. Cada cambio reprograma todo.
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { getSetting, setSetting } from '@/database/queries';
import { notificacionDePrueba, reprogramarTodo } from '@/notifications/programar';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

type Aviso = { key: string; horaKey?: string; titulo: string; detalle: string; defecto?: string };

const AVISOS: Aviso[] = [
  { key: 'notif_manana', horaKey: 'hora_manana', titulo: 'Resumen de la mañana', detalle: 'Tareas del día y si toca gym', defecto: '08:00' },
  { key: 'notif_noche', horaKey: 'hora_noche', titulo: 'Recordatorio de la noche', detalle: 'Solo si te quedan tareas', defecto: '21:30' },
  { key: 'notif_domingo', horaKey: 'hora_domingo', titulo: 'Resumen del domingo', detalle: 'Tareas, gym y gastos de la semana', defecto: '20:00' },
  { key: 'notif_fijos', titulo: 'Pagos fijos', detalle: 'Un día antes de cada gasto fijo' },
  { key: 'notif_clases', titulo: 'Antes de cada clase', detalle: '10 minutos antes, con la sala' },
  { key: 'notif_pruebas', titulo: 'Pruebas', detalle: 'La noche anterior y la mañana de la prueba' },
];

export function NotifSettings() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const v: Record<string, string> = {};
      for (const a of AVISOS) {
        v[a.key] = (await getSetting(db, a.key)) ?? '1';
        if (a.horaKey) v[a.horaKey] = (await getSetting(db, a.horaKey)) ?? a.defecto!;
      }
      setValores(v);
    })().catch(console.warn);
  }, [db]);

  const guardar = async (key: string, value: string) => {
    setValores((v) => ({ ...v, [key]: value }));
    await setSetting(db, key, value);
    reprogramarTodo(db).catch(console.warn);
  };

  const elegirHora = (a: Aviso) => {
    if (!a.horaKey || Platform.OS !== 'android') return;
    const [h, m] = (valores[a.horaKey] ?? a.defecto!).split(':').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(2000, 0, 1, h, m),
      mode: 'time',
      is24Hour: true,
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        guardar(a.horaKey!, `${hh}:${mm}`).catch(console.warn);
      },
    });
  };

  const probar = async () => {
    const ok = await notificacionDePrueba();
    if (!ok) {
      Alert.alert(
        'Sin permiso',
        'Tinzit0 no tiene permiso para notificarte. Actívalo en Ajustes del celular → Apps → Expo Go (o Tinzit0) → Notificaciones.',
      );
    }
  };

  return (
    <View>
      {AVISOS.map((a, i) => {
        const on = valores[a.key] !== '0';
        return (
          <View key={a.key} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <AppText variant="callout">{a.titulo}</AppText>
              <AppText variant="caption" tone="tertiary">{a.detalle}</AppText>
            </View>
            {a.horaKey ? (
              <Pressable
                onPress={() => elegirHora(a)}
                disabled={!on}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Cambiar hora de ${a.titulo}`}
                style={[styles.hora, { backgroundColor: colors.surfaceRaised, opacity: on ? 1 : 0.4 }]}
              >
                <AppText variant="callout" tabular>{valores[a.horaKey] ?? a.defecto}</AppText>
              </Pressable>
            ) : null}
            <Switch
              value={on}
              onValueChange={(v) => {
                guardar(a.key, v ? '1' : '0').catch(console.warn);
              }}
              trackColor={{ false: colors.surfaceRaised, true: colors.accent }}
              thumbColor={on ? colors.onAccent : '#f4f4f4'}
              accessibilityLabel={a.titulo}
            />
          </View>
        );
      })}
      <Button label="Enviar notificación de prueba" variant="secondary" onPress={probar} style={{ marginTop: space.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  hora: { borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 36, justifyContent: 'center' },
});
